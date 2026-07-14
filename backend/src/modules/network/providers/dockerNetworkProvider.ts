import { NetworkProvider } from './networkProvider';
import { VirtualEndpoint } from '../mapper/virtualNetworkMapper';
import { NetworkIntent } from '../planner/enforcementPlanner';
import docker from '../../../infrastructure/docker/DockerClient';
import { ProjectService } from '../../projects/services/projectService';
import { buildCidrCorrections, applyCidrCorrections } from './cidrCorrections';
import { getSubnetPrefix, getDockerGatewayIp, getNatGatewayIp, resolveVpcCidrShift } from './subnetAddressing';
import { findNatRoute, findNatEndpoint } from './natResolution';
import { buildSecurityGroupIntentCommands, buildGatewayAllowCommands } from './firewallRules';
import { buildLoadBalancerNginxConfig } from './nginxConfigBuilder';

/** Loop-invariant state shared while connecting every endpoint to its target network. */
interface ConnectContext {
  projectId: string;
  config: any;
  dockerContainers: any[];
  endpoints: VirtualEndpoint[];
  resolvedCidrs: Record<string, string>;
  assignedIps: Set<string>;
}

/** State shared across the firewall configuration steps for every endpoint. */
interface PlanSharedContext {
  projectId: string;
  config: any;
  endpoints: VirtualEndpoint[];
  intents: NetworkIntent[];
  dockerContainers: any[];
  updatedDockerContainers: any[];
  ipMap: Record<string, string>;
  idMap: Record<string, string>;
  resolvedCidrs: Record<string, string>;
  vpcCidr: string;
  isIgwEnabled: boolean;
  sharedNetGateway: string;
}

/** Per-container context resolved once and threaded through the firewall configuration steps. */
interface FirewallContext extends PlanSharedContext {
  ep: VirtualEndpoint;
  containerInfo: any;
  containerId: string;
  nodeType: string;
  subnetId: any;
  subnet: any;
  cidr: string;
  dockerGatewayIp: string;
}

export class DockerNetworkProvider implements NetworkProvider {
  private async runExec(containerId: string, cmd: string[]): Promise<string> {
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
        User: 'root'
      });
      const stream = await exec.start({});
      const output = await new Promise<string>((resolve, reject) => {
        let data = '';
        container.modem.demuxStream(
          stream,
          {
            write: (chunk: Buffer) => { data += chunk.toString(); }
          },
          {
            write: (chunk: Buffer) => { data += chunk.toString(); }
          }
        );
        stream.on('end', () => resolve(data.trim()));
        stream.on('error', (err) => reject(err));
      });

      const status = await exec.inspect();
      if (status.ExitCode !== 0) {
        throw new Error(`Command failed inside container with exit code ${status.ExitCode}. Output: ${output}`);
      }
      return output;
    } catch (err: any) {
      if (err.statusCode === 404 || err.message?.includes('no such container') || err.message?.includes('No such container')) {
        console.warn(`[DockerNetworkProvider] Container ${containerId.slice(0, 12)} not found during exec [${cmd.join(' ')}]. Skipping.`);
        return '';
      }
      if (cmd[0] === 'ip' && cmd[1] === 'route' && cmd[2] === 'del' && err.message?.includes('No such process')) {
        return '';
      }
      console.error(`Exec failed for cmd [${cmd.join(' ')}]:`, err);
      throw err;
    }
  }

  /** Resolves each endpoint's containerName to the real Docker container name, in place. */
  private resolveContainerNames(endpoints: VirtualEndpoint[], dockerContainers: any[]): void {
    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c => c.Id === ep.nodeId || c.Id.startsWith(ep.nodeId));
      if (containerInfo && containerInfo.Names && containerInfo.Names.length > 0) {
        ep.containerName = containerInfo.Names[0].replace(/^\//, '');
      }
    }
  }

  private async resolveSharedNetworkGateway(allNetworks: any[]): Promise<string> {
    const sharedNet = allNetworks.find(n => n.Name === 'akal-lab-network');
    if (!sharedNet) return '';
    try {
      const netInspect = await docker.getNetwork(sharedNet.Id).inspect();
      const gateway = netInspect.IPAM?.Config?.[0]?.Gateway || '';
      console.log(`[DockerNetworkProvider] Found akal-lab-network gateway: ${gateway}`);
      return gateway;
    } catch (err) {
      console.error('[DockerNetworkProvider] Failed to inspect akal-lab-network:', err);
      return '';
    }
  }

  private async cleanupObsoleteSubnetNetworks(projectId: string, config: any, allNetworks: any[]): Promise<void> {
    const activeSubnetIds = (config.subnets || []).map((s: any) => s.id);

    for (const net of allNetworks) {
      if (!net.Name.startsWith(`akal-subnet-${projectId}-`)) continue;

      const subnetId = net.Name.replace(`akal-subnet-${projectId}-`, '');
      if (activeSubnetIds.includes(subnetId)) continue;

      console.log(`[DockerNetworkProvider] Removing obsolete subnet network: ${net.Name}`);
      try {
        const network = docker.getNetwork(net.Id);
        const netInspect = await network.inspect();
        const connectedContainers = Object.keys(netInspect.Containers || {});
        for (const cId of connectedContainers) {
          await network.disconnect({ Container: cId, Force: true });
        }
        await network.remove();
      } catch (err) {
        console.error(`Failed to remove obsolete network ${net.Name}:`, err);
      }
    }
  }

  private async ensureActiveSubnetNetworks(projectId: string, config: any, allNetworks: any[]): Promise<Record<string, string>> {
    const resolvedCidrs: Record<string, string> = {};
    for (const subnet of config.subnets || []) {
      const cidr = subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
      const netName = `akal-subnet-${projectId}-${subnet.id}`;
      try {
        resolvedCidrs[subnet.id] = await this.ensureNetwork(netName, cidr, allNetworks);
      } catch (err) {
        console.error(`Failed to ensure network ${netName}:`, err);
      }
    }
    return resolvedCidrs;
  }

  /** Resolves the static IP to assign this endpoint on its target subnet, tracking newly assigned IPs to avoid collisions. */
  private resolveTargetIp(ep: VirtualEndpoint, subnetId: any, prefix: string, targetNetwork: string, ctx: ConnectContext): string {
    const configIp = ctx.config.nodeIpMap?.[ep.nodeId];
    if (configIp && configIp.startsWith(prefix)) {
      return configIp;
    }
    if (configIp) {
      const suffixMatch = configIp.match(/\.(\d+)$/);
      const suffix = suffixMatch ? suffixMatch[1] : '2';
      return `${prefix}${suffix}`;
    }

    // Find all currently used IPs on this subnet
    const usedIps = new Set<string>();
    for (const cInfo of ctx.dockerContainers) {
      const nets = cInfo.NetworkSettings?.Networks;
      if (nets && nets[targetNetwork] && nets[targetNetwork].IPAddress) {
        usedIps.add(nets[targetNetwork].IPAddress);
      }
    }
    for (const otherEp of ctx.endpoints) {
      if (otherEp.nodeId !== ep.nodeId && ctx.config.nodeSubnetMap[otherEp.nodeId] === subnetId) {
        const otherIp = ctx.config.nodeIpMap?.[otherEp.nodeId];
        if (otherIp && otherIp.startsWith(prefix)) {
          usedIps.add(otherIp);
        }
      }
    }
    for (const ip of ctx.assignedIps) {
      usedIps.add(ip);
    }
    let suffix = 2;
    while (usedIps.has(`${prefix}${suffix}`)) {
      suffix++;
    }
    const targetIp = `${prefix}${suffix}`;
    ctx.assignedIps.add(targetIp);
    return targetIp;
  }

  private async connectEndpointToSubnetNetwork(
    ep: VirtualEndpoint,
    subnet: any,
    subnetId: any,
    ctx: ConnectContext,
    containerInfo: any,
    inspect: any,
    currentNetworks: string[]
  ): Promise<void> {
    const { projectId, config, dockerContainers, endpoints } = ctx;
    const cidr = ctx.resolvedCidrs[subnetId] || subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
    const prefix = getSubnetPrefix(cidr);
    const targetNetwork = `akal-subnet-${projectId}-${subnetId}`;

    const targetIp = prefix ? this.resolveTargetIp(ep, subnetId, prefix, targetNetwork, ctx) : '';

    const nodeType = containerInfo.Labels?.['akal.node.type'] || 'ubuntu';
    const isLoadBalancer = nodeType === 'loadbalancer';
    const isPublicUbuntu = nodeType === 'ubuntu' && subnet.type === 'public';

    for (const netName of currentNetworks) {
      if (netName === targetNetwork || (!netName.startsWith('akal-subnet-') && netName !== 'akal-lab-network')) continue;

      if (netName === 'akal-lab-network' && (isLoadBalancer || isPublicUbuntu)) {
        continue; // Keep connected to default bridge network for port mappings
      }

      if (nodeType === 'nat') {
        const matchedSubnet = (config.subnets || []).find((s: any) => `akal-subnet-${projectId}-${s.id}` === netName);
        if (matchedSubnet) {
          const natRoute = findNatRoute(matchedSubnet, endpoints, config, dockerContainers, projectId);
          if (natRoute) {
            const natEp = findNatEndpoint(natRoute, endpoints, config, projectId);
            if (natEp && natEp.nodeId === ep.nodeId) {
              // Do NOT disconnect NAT Gateway from the private subnet networks it is routing traffic for
              continue;
            }
          }
        }
      }

      console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from ${netName}...`);
      try {
        await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
      } catch {
        // Ignore disconnect error if network is not connected
      }
    }

    const isConnected = currentNetworks.includes(targetNetwork);
    const currentIp = inspect.NetworkSettings.Networks[targetNetwork]?.IPAddress;

    // If the container is already connected and has a valid subnet IP, skip reconnecting
    const hasValidSubnetIp = isConnected && currentIp && prefix && currentIp.startsWith(prefix);

    if (!hasValidSubnetIp && (!isConnected || currentIp !== targetIp)) {
      if (isConnected) {
        console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to ${targetNetwork} due to IP mismatch...`);
        try {
          await docker.getNetwork(targetNetwork).disconnect({ Container: containerInfo.Id, Force: true });
        } catch {
          // Ignore disconnect error if network is not connected
        }
      }
      console.log(`[DockerNetworkProvider] Connecting container ${ep.containerName} to ${targetNetwork} with static IP ${targetIp}...`);
      const containerNodeName = containerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
      try {
        await docker.getNetwork(targetNetwork).connect({
          Container: containerInfo.Id,
          EndpointConfig: {
            IPAMConfig: {
              IPv4Address: targetIp
            },
            Aliases: [containerNodeName]
          }
        });
      } catch (err) {
        console.error(`Failed to connect container ${ep.containerName} to network ${targetNetwork} with IP ${targetIp}:`, err);
      }
    }

    // Reconnect to default akal-lab-network if node is public (loadbalancer or public ubuntu) and disconnected
    if ((isLoadBalancer || isPublicUbuntu) && !currentNetworks.includes('akal-lab-network')) {
      console.log(`[DockerNetworkProvider] Reconnecting public container ${ep.containerName} to default network akal-lab-network...`);
      try {
        await docker.getNetwork('akal-lab-network').connect({ Container: containerInfo.Id });
      } catch (err) {
        console.error(`Failed to reconnect public container ${ep.containerName} to default network:`, err);
      }
    }
  }

  private async connectEndpointToDefaultNetwork(ep: VirtualEndpoint, containerInfo: any, currentNetworks: string[]): Promise<void> {
    const targetNetwork = 'akal-lab-network';
    for (const netName of currentNetworks) {
      if (netName !== targetNetwork && netName.startsWith('akal-subnet-')) {
        console.log(`[DockerNetworkProvider] Disconnecting container ${ep.containerName} from subnet network ${netName}...`);
        try {
          await docker.getNetwork(netName).disconnect({ Container: containerInfo.Id, Force: true });
        } catch {
          // Ignore disconnect error if network is not connected
        }
      }
    }

    if (!currentNetworks.includes(targetNetwork)) {
      console.log(`[DockerNetworkProvider] Reconnecting container ${ep.containerName} to default network ${targetNetwork}...`);
      try {
        await docker.getNetwork(targetNetwork).connect({ Container: containerInfo.Id });
      } catch {
        // Ignore connect error if network connection fails
      }
    }
  }

  private async connectEndpointToTargetNetwork(ep: VirtualEndpoint, ctx: ConnectContext): Promise<void> {
    const containerInfo = ctx.dockerContainers.find(c =>
      c.Id === ep.nodeId ||
      c.Id.startsWith(ep.nodeId) ||
      c.Names.some((name: string) => name.replace(/^\//, '') === ep.containerName)
    );
    if (!containerInfo || containerInfo.State !== 'running') return;

    const container = docker.getContainer(containerInfo.Id);
    const inspect = await container.inspect();
    const currentNetworks = Object.keys(inspect.NetworkSettings.Networks || {});

    const subnetId = ctx.config.nodeSubnetMap[ep.nodeId];
    if (subnetId) {
      const subnet = ctx.config.subnets.find((s: any) => s.id === subnetId);
      if (subnet) {
        await this.connectEndpointToSubnetNetwork(ep, subnet, subnetId, ctx, containerInfo, inspect, currentNetworks);
      }
    } else {
      await this.connectEndpointToDefaultNetwork(ep, containerInfo, currentNetworks);
    }
  }

  private async applyHostIptablesForwardingBypass(): Promise<void> {
    try {
      const temp = await docker.createContainer({
        Image: 'derssa/backend-lab-ubuntu:v1',
        HostConfig: {
          Privileged: true,
          NetworkMode: 'host',
          AutoRemove: true
        },
        Cmd: [
          'sh',
          '-c',
          'iptables -C FORWARD -j ACCEPT 2>/dev/null || iptables -I FORWARD -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 10.0.0.0/8 -d 10.0.0.0/8 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 172.16.0.0/12 -d 172.16.0.0/12 -j ACCEPT && ' +
          'iptables -t nat -D POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT 2>/dev/null; iptables -t nat -I POSTROUTING -s 192.168.0.0/16 -d 192.168.0.0/16 -j ACCEPT'
        ]
      });
      await temp.start();
    } catch (err) {
      console.warn('[DockerNetworkProvider] Failed to apply host iptables forwarding/NAT bypass:', err);
    }
  }

  private async connectNatGatewaysToPrivateSubnets(
    projectId: string,
    endpoints: VirtualEndpoint[],
    config: any,
    dockerContainers: any[],
    resolvedCidrs: Record<string, string>
  ): Promise<void> {
    for (const subnet of config.subnets || []) {
      const natRoute = findNatRoute(subnet, endpoints, config, dockerContainers, projectId);
      if (!natRoute) continue;

      const natEp = findNatEndpoint(natRoute, endpoints, config, projectId);
      if (!natEp) continue;

      const natContainerInfo = dockerContainers.find(c =>
        c.Id === natEp.nodeId ||
        c.Names.some((name: string) => name.replace(/^\//, '') === natEp.containerName)
      );
      if (!natContainerInfo || natContainerInfo.State !== 'running') continue;

      const privateNetName = `akal-subnet-${projectId}-${subnet.id}`;
      const container = docker.getContainer(natContainerInfo.Id);
      const inspect = await container.inspect();
      const currentNets = Object.keys(inspect.NetworkSettings.Networks || {});

      const cidr = resolvedCidrs[subnet.id] || subnet.cidr || `10.0.${config.subnets.indexOf(subnet) + 1}.0/24`;
      const targetIp = getNatGatewayIp(cidr);

      const isConnected = currentNets.includes(privateNetName);
      const currentIp = inspect.NetworkSettings.Networks[privateNetName]?.IPAddress;
      if (isConnected && currentIp === targetIp) continue;

      if (isConnected) {
        console.log(`[DockerNetworkProvider] Reconnecting NAT Gateway ${natEp.containerName} to private subnet network ${privateNetName} due to IP mismatch...`);
        try {
          await docker.getNetwork(privateNetName).disconnect({ Container: natContainerInfo.Id, Force: true });
        } catch {
          // Ignore disconnect error
        }
      }
      console.log(`[DockerNetworkProvider] Connecting NAT Gateway ${natEp.containerName} to private subnet network ${privateNetName} with IP ${targetIp}...`);
      try {
        // Temporarily clear default route to prevent Docker gateway programming conflicts ("failed to set gateway: file exists")
        await this.runExec(natContainerInfo.Id, ['ip', 'route', 'del', 'default']).catch(() => {});

        await docker.getNetwork(privateNetName).connect({
          Container: natContainerInfo.Id,
          EndpointConfig: {
            IPAMConfig: {
              IPv4Address: targetIp
            }
          }
        });
      } catch (err) {
        console.error(`Failed to connect NAT Gateway to network ${privateNetName}:`, err);
      }
    }
  }

  private buildIpAndIdMaps(endpoints: VirtualEndpoint[], updatedDockerContainers: any[]): { ipMap: Record<string, string>; idMap: Record<string, string> } {
    const ipMap: Record<string, string> = {};
    const idMap: Record<string, string> = {};

    for (const ep of endpoints) {
      const containerInfo = updatedDockerContainers.find(c =>
        c.Id === ep.nodeId ||
        c.Id.startsWith(ep.nodeId) ||
        c.Names.some((name: string) => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const networks = containerInfo.NetworkSettings?.Networks || {};
        let key = Object.keys(networks).find(k => k.startsWith('akal-subnet-'));
        if (!key) {
          key = Object.keys(networks).find(k => k.startsWith('akal-'));
        }
        if (key && networks[key] && networks[key].IPAddress) {
          ipMap[ep.nodeId] = networks[key].IPAddress;
          idMap[ep.nodeId] = containerInfo.Id;
          console.log(`[DockerNetworkProvider] Resolved subnet node ${ep.nodeId} -> Container ${containerInfo.Id.slice(0, 12)} (${networks[key].IPAddress})`);
        }
      }
    }

    return { ipMap, idMap };
  }

  private async configureNatGateway(ctx: FirewallContext): Promise<void> {
    console.log(`[DockerNetworkProvider] Node ${ctx.ep.containerName} is a NAT Gateway. Configuring IP forwarding and masquerade...`);
    await this.runExec(ctx.containerId, ['sh', '-c', 'sysctl -w net.ipv4.ip_forward=1']);
    await this.runExec(ctx.containerId, ['sh', '-c', 'iptables -t nat -F POSTROUTING']);
    await this.runExec(ctx.containerId, ['sh', '-c', 'iptables -t nat -A POSTROUTING -j MASQUERADE']);
    await this.runExec(ctx.containerId, ['sh', '-c', 'iptables -F FORWARD 2>/dev/null || true']);
    if (ctx.isIgwEnabled) {
      await this.runExec(ctx.containerId, ['sh', '-c', 'iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT']);
      await this.runExec(ctx.containerId, ['sh', '-c', `iptables -A FORWARD -s ${ctx.vpcCidr} -j ACCEPT`]);
    }
    await this.runExec(ctx.containerId, ['sh', '-c', 'iptables -A FORWARD -j REJECT']);
  }

  /** Resolves the target IPs for a single Load Balancer target (a node or an ASG boundary id). */
  private resolveLoadBalancerTargetIps(
    targetId: string,
    config: any,
    updatedDockerContainers: any[],
    ipMap: Record<string, string>,
    asgIps: Record<string, string[]>
  ): string[] {
    const asgConfig = config.asgs?.[targetId];
    const asgContainer = updatedDockerContainers.find((c: any) => c.Id === targetId || c.Id.startsWith(targetId));
    const isAsgRunning = asgContainer && asgContainer.State === 'running';

    if (asgConfig && asgConfig.parentId && isAsgRunning && ipMap[asgConfig.parentId]) {
      return [ipMap[asgConfig.parentId]];
    }
    if (asgIps[targetId]) {
      return [...asgIps[targetId]];
    }
    if (ipMap[targetId]) {
      return [ipMap[targetId]];
    }
    return [];
  }

  private async configureLoadBalancer(ctx: FirewallContext): Promise<void> {
    const { ep, config, updatedDockerContainers, ipMap, containerId } = ctx;
    console.log(`[DockerNetworkProvider] Node ${ep.containerName} is a Load Balancer. Configuring Nginx dynamic proxy...`);

    // Gather all active ASG instance IPs dynamically from running Docker containers
    const asgIps: Record<string, string[]> = {};
    for (const c of updatedDockerContainers) {
      const asgId = c.Labels?.['akal.asg.id'];
      if (asgId && c.State === 'running') {
        const networks = c.NetworkSettings?.Networks || {};
        const netKey = Object.keys(networks).find((k: string) => k.startsWith('akal-subnet-'));
        if (netKey && networks[netKey]?.IPAddress) {
          if (!asgIps[asgId]) asgIps[asgId] = [];
          asgIps[asgId].push(networks[netKey].IPAddress);
        }
      }
    }

    const targets = config.loadBalancerTargets?.[ep.nodeId] || [];
    const targetIps: string[] = [];
    for (const tId of targets) {
      targetIps.push(...this.resolveLoadBalancerTargetIps(tId, config, updatedDockerContainers, ipMap, asgIps));
    }

    const targetPort = config.loadBalancerTargetPorts?.[ep.nodeId] || 80;
    const routingRules = config.loadBalancerRoutingRules?.[ep.nodeId] || [];
    const rules = routingRules.map((rule: any) => ({
      path: rule.path,
      targetIps: this.resolveLoadBalancerTargetIps(rule.targetId, config, updatedDockerContainers, ipMap, asgIps)
    }));

    const nginxConfig = buildLoadBalancerNginxConfig({ targetIps, targetPort, rules });

    // Write configuration into container and reload Nginx
    await this.runExec(containerId, ['sh', '-c', `cat << 'EOF' > /etc/nginx/nginx.conf\n${nginxConfig}\nEOF`]);
    await this.runExec(containerId, ['nginx', '-s', 'reload']);
  }

  private async initFirewallChains(containerId: string): Promise<void> {
    await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-INPUT 2>/dev/null || true']);
    await this.runExec(containerId, ['sh', '-c', 'iptables -N AKAL-OUTPUT 2>/dev/null || true']);
    await this.runExec(containerId, ['sh', '-c', 'iptables -C INPUT -j AKAL-INPUT 2>/dev/null || iptables -A INPUT -j AKAL-INPUT']);
    await this.runExec(containerId, ['sh', '-c', 'iptables -C OUTPUT -j AKAL-OUTPUT 2>/dev/null || iptables -A OUTPUT -j AKAL-OUTPUT']);
    await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
    await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);
  }

  private async configureDnsAndHosts(ctx: FirewallContext, isDnsEnabled: boolean): Promise<void> {
    const { ep, endpoints, ipMap, idMap, updatedDockerContainers, containerInfo, containerId, projectId } = ctx;

    // Configure /etc/hosts for cross-subnet DNS resolution (using true node names)
    const selfNodeName = containerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
    const hostsContent = [
      '127.0.0.1 localhost',
      '::1 localhost ip6-localhost ip6-loopback',
      `${ipMap[ep.nodeId]} ${selfNodeName}`
    ];

    if (isDnsEnabled) {
      for (const otherEp of endpoints) {
        if (otherEp.nodeId === ep.nodeId) continue;
        const otherIp = ipMap[otherEp.nodeId];
        const otherContainerInfo = updatedDockerContainers.find((c: any) => c.Id === idMap[otherEp.nodeId]);
        if (otherIp && otherContainerInfo) {
          const otherNodeName = otherContainerInfo.Names[0].replace(/^\//, '').replace(`akal-lab-${projectId}-`, '');
          hostsContent.push(`${otherIp} ${otherNodeName}`);
        }
      }
    }

    const hostsStr = hostsContent.join('\n');
    await this.runExec(containerId, ['sh', '-c', `cat << 'EOF' > /etc/hosts\n${hostsStr}\nEOF`]);

    // DNS Control: If DNS resolution is disabled, drop outbound port 53 traffic (DNS queries)
    // This is placed after the hosts write and before loopback rules to ensure local Docker DNS
    // queries (sent to loopback resolver 127.0.0.11) are blocked.
    if (!isDnsEnabled) {
      console.log(`[DockerNetworkProvider] DNS is disabled. Blocking Port 53 and local resolver 127.0.0.11 outbound inside container ${containerId.slice(0, 12)}...`);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.11', '-j', 'REJECT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'udp', '--dport', '53', '-j', 'REJECT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-p', 'tcp', '--dport', '53', '-j', 'REJECT']);
    }
  }

  private async allowLoopbackTraffic(containerId: string): Promise<void> {
    // Allow established loopback and related connections (essential for container health & pings)
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-i', 'lo', '-j', 'ACCEPT']);
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-o', 'lo', '-j', 'ACCEPT']);
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', '127.0.0.0/8', '-j', 'ACCEPT']);
  }

  /**
   * Routing Table & Internet Gateway Enforcement (evaluated before conntrack and security groups):
   * points the container's default route at the NAT Gateway or the Docker bridge gateway, and
   * routes the local VPC CIDR via the bridge gateway to bypass the NAT default route and preserve
   * source IPs for Security Groups (skipped for NAT Gateways themselves, to avoid routing conflicts).
   */
  private async configureRouting(ctx: FirewallContext): Promise<{ isInternetAllowed: boolean; hasLocalRoute: boolean }> {
    const { ep, config, subnet, cidr, dockerGatewayIp, containerId, dockerContainers, endpoints, projectId, vpcCidr, isIgwEnabled, nodeType } = ctx;

    const isPublicSubnet = subnet?.type === 'public';
    const hasIgwRoute = subnet?.routes?.some((r: any) => r.destination === '0.0.0.0/0' && r.target === 'igw');
    const hasLocalRoute = subnet?.routes?.some((r: any) => r.destination === (config.vpcConfig?.cidr || '10.0.0.0/16') && r.target === 'local');

    // Check if this subnet has a NAT Gateway route
    const natRoute = findNatRoute(subnet, endpoints, config, dockerContainers, projectId);
    const isInternetAllowed = isIgwEnabled && ((isPublicSubnet && hasIgwRoute) || !!natRoute);

    // Configure default route for this container based on routing tables
    if (natRoute) {
      const natGatewayIp = getNatGatewayIp(cidr);
      if (natGatewayIp) {
        console.log(`[DockerNetworkProvider] Setting default gateway for container ${ep.containerName} to NAT Gateway ${natGatewayIp}...`);
        await this.runExec(containerId, ['ip', 'route', 'replace', 'default', 'via', natGatewayIp]);
      }
    } else if (dockerGatewayIp) {
      await this.runExec(containerId, ['ip', 'route', 'replace', 'default', 'via', dockerGatewayIp]);
    }

    if (nodeType !== 'nat') {
      if (dockerGatewayIp) {
        console.log(`[DockerNetworkProvider] Setting local VPC route for container ${ep.containerName} to ${vpcCidr} via ${dockerGatewayIp}...`);
        await this.runExec(containerId, ['ip', 'route', 'replace', vpcCidr, 'via', dockerGatewayIp]);
      }
    } else {
      // Clean up any existing VPC route in the NAT Gateway container to avoid interface attaching conflicts
      await this.runExec(containerId, ['ip', 'route', 'del', vpcCidr]).catch(() => {});
    }

    return { isInternetAllowed: !!isInternetAllowed, hasLocalRoute: !!hasLocalRoute };
  }

  private async applySecurityGroupIntents(ctx: FirewallContext): Promise<void> {
    for (const intent of ctx.intents) {
      const commands = buildSecurityGroupIntentCommands(intent, ctx.ep.nodeId, ctx.nodeType, ctx.ipMap);
      for (const cmd of commands) {
        await this.runExec(ctx.containerId, cmd);
      }
    }
  }

  /** Allows host-to-container connections via the bridge/shared-network gateways when a security group allows inbound from 0.0.0.0/0. */
  private async applyHostGatewayAllowRules(ctx: FirewallContext): Promise<void> {
    const nodeSgs = ctx.config.nodeSecurityGroups?.[ctx.ep.nodeId] || [];
    for (const sg of nodeSgs) {
      if (sg.type !== 'inbound' || sg.source !== '0.0.0.0/0') continue;

      const rawProto = (sg.protocol || 'all').toLowerCase();
      const rawPort = sg.port || 'ALL';
      const port = (typeof rawPort === 'string' && rawPort.toUpperCase() === 'ALL') ? 'ALL' : rawPort;
      const iptablesAction = (sg.action || 'ALLOW') === 'ALLOW' ? 'ACCEPT' : 'REJECT';

      for (const cmd of buildGatewayAllowCommands(ctx.dockerGatewayIp, rawProto, port, iptablesAction)) {
        await this.runExec(ctx.containerId, cmd);
      }

      const hasSharedNet = ctx.containerInfo.NetworkSettings?.Networks?.['akal-lab-network'];
      if (hasSharedNet && ctx.sharedNetGateway) {
        for (const cmd of buildGatewayAllowCommands(ctx.sharedNetGateway, rawProto, port, iptablesAction)) {
          await this.runExec(ctx.containerId, cmd);
        }
      }
    }
  }

  private async verifyFirewallChains(containerId: string): Promise<void> {
    const iptablesS = await this.runExec(containerId, ['iptables', '-S']);
    if (!iptablesS || !iptablesS.includes('-N AKAL-INPUT') || !iptablesS.includes('-N AKAL-OUTPUT')) {
      console.error(`[DockerNetworkProvider] Verification output:\n${iptablesS}`);
      throw new Error(`Firewall verification failed inside container ${containerId.slice(0, 12)}: custom chains were not created/found.`);
    }
  }

  private async configureContainerFirewall(ep: VirtualEndpoint, shared: PlanSharedContext): Promise<void> {
    const containerId = shared.idMap[ep.nodeId];
    if (!containerId) return;

    const containerInfo = shared.updatedDockerContainers.find((c: any) => c.Id === containerId);
    if (!containerInfo) return;

    // Check that iptables and ip (iproute2) are available inside this container:
    // both are exec'd below, and a missing 'ip' would otherwise throw mid-plan.
    const hasNetTools = await this.runExec(containerId, ['sh', '-c', 'command -v iptables >/dev/null 2>&1 && command -v ip >/dev/null 2>&1 && echo ok || true']);
    if (hasNetTools.trim() !== 'ok') {
      console.warn(`[DockerNetworkProvider] Skipping firewall configuration for container ${containerId.slice(0, 12)} (${ep.containerName}): 'iptables' and/or 'ip' (iproute2) is not installed. See docs/adding-a-node.md#required-tooling-inside-every-node-image.`);
      return;
    }

    console.log(`[DockerNetworkProvider] Applying firewall rules inside container ${containerId.slice(0, 12)}...`);

    const nodeType = containerInfo.Labels?.['akal.node.type'] || 'ubuntu';
    const subnetId = shared.config.nodeSubnetMap[ep.nodeId];
    const subnet = shared.config.subnets?.find((s: any) => s.id === subnetId);
    const cidr = shared.resolvedCidrs[subnetId] || subnet?.cidr || `10.0.${shared.config.subnets.indexOf(subnet) + 1}.0/24`;
    const dockerGatewayIp = getDockerGatewayIp(cidr);

    const ctx: FirewallContext = { ...shared, ep, containerInfo, containerId, nodeType, subnetId, subnet, cidr, dockerGatewayIp };

    if (nodeType === 'nat') {
      await this.configureNatGateway(ctx);
    }
    if (nodeType === 'loadbalancer') {
      await this.configureLoadBalancer(ctx);
    }

    await this.initFirewallChains(containerId);

    const isDnsEnabled = shared.config.vpcConfig?.dnsEnabled !== false;
    await this.configureDnsAndHosts(ctx, isDnsEnabled);

    await this.allowLoopbackTraffic(containerId);

    const { isInternetAllowed, hasLocalRoute } = await this.configureRouting(ctx);

    if (!hasLocalRoute) {
      // Reject local VPC subnet-to-subnet traffic if local route is deleted
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', ctx.vpcCidr, '-j', 'REJECT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-s', ctx.vpcCidr, '-j', 'REJECT']);
    }

    if (!isInternetAllowed) {
      // Block external internet traffic (anything outside VPC CIDR) if internet access is blocked
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '!', '-d', ctx.vpcCidr, '-j', 'REJECT']);
    }

    // Stateful rule tracking
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT']);

    // Process intents affecting this node (Security Groups)
    await this.applySecurityGroupIntents(ctx);

    // Default Outbound Fallthrough policy
    if (isInternetAllowed) {
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'ACCEPT']);
    } else {
      // If internet is blocked, but the traffic falls through routing/SG checks (so it is local VPC traffic), ACCEPT it.
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-d', ctx.vpcCidr, '-j', 'ACCEPT']);
      await this.runExec(containerId, ['iptables', '-A', 'AKAL-OUTPUT', '-j', 'REJECT']);
    }

    // Allow host-to-container connections via bridge gateway if security group allows inbound from 0.0.0.0/0
    await this.applyHostGatewayAllowRules(ctx);

    // Default Inbound: REJECT ALL (Zero-trust secure baseline)
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-p', 'tcp', '-j', 'REJECT', '--reject-with', 'tcp-reset']);
    await this.runExec(containerId, ['iptables', '-A', 'AKAL-INPUT', '-j', 'REJECT']);

    await this.verifyFirewallChains(containerId);
  }

  private async persistCidrCorrections(
    projectId: string,
    config: any,
    vpcCidr: string,
    resolvedCidrs: Record<string, string>,
    ipMap: Record<string, string>
  ): Promise<void> {
    // Persist shifted CIDRs/IPs back to projects.json. Merge the corrections
    // into a freshly read config: this plan may have been queued behind other
    // work, and saving the config it started from would clobber any save that
    // landed in the meantime.
    const corrections = buildCidrCorrections(config, vpcCidr, resolvedCidrs, ipMap);
    if (!corrections) return;

    console.log('[DockerNetworkProvider] Persisting shifted CIDRs and IPs back to projects.json...');
    try {
      const currentConfig = await ProjectService.getNetworkConfig(projectId);
      if (currentConfig) {
        applyCidrCorrections(currentConfig, corrections);
        await ProjectService.saveNetworkConfig(projectId, currentConfig);
      }
    } catch (err) {
      console.error('[DockerNetworkProvider] Failed to persist shifted CIDRs to database:', err);
    }
  }

  public async applyPlan(projectId: string, endpoints: VirtualEndpoint[], intents: NetworkIntent[], config: any): Promise<void> {
    console.log(`[DockerNetworkProvider] Applying network plan for project: ${projectId}`);

    const dockerContainers = await docker.listContainers({ all: true });
    this.resolveContainerNames(endpoints, dockerContainers);

    // 1. Obsolete Docker Subnet Network Cleanup
    const allNetworks = await docker.listNetworks();
    const sharedNetGateway = await this.resolveSharedNetworkGateway(allNetworks);
    await this.cleanupObsoleteSubnetNetworks(projectId, config, allNetworks);

    // 2. Ensure networks for active subnets exist
    const resolvedCidrs = await this.ensureActiveSubnetNetworks(projectId, config, allNetworks);

    // Resolve the actual VPC CIDR based on potential subnet shifts
    const vpcCidr = resolveVpcCidrShift(config.vpcConfig?.cidr || '10.0.0.0/16', Object.values(resolvedCidrs)[0]);

    // 3. Connect containers to their target subnet networks (or akal-lab-network) and assign static IPs
    const connectCtx: ConnectContext = { projectId, config, dockerContainers, endpoints, resolvedCidrs, assignedIps: new Set<string>() };
    for (const ep of endpoints) {
      await this.connectEndpointToTargetNetwork(ep, connectCtx);
    }

    // Ensure Docker host-level forwarding and NAT bypass are applied dynamically to prevent Docker resets from wiping them.
    // This is run after all container connections to override any Docker-inserted POSTROUTING rules.
    await this.applyHostIptablesForwardingBypass();

    // Connect NAT gateways to their private subnets
    await this.connectNatGatewaysToPrivateSubnets(projectId, endpoints, config, dockerContainers, resolvedCidrs);

    // 4. Build IP map and ID map using updated network inspects
    const updatedDockerContainers = await docker.listContainers({ all: true });
    const { ipMap, idMap } = this.buildIpAndIdMaps(endpoints, updatedDockerContainers);

    // Configure firewall for each active container in parallel to speed up scaling and deployments
    const isIgwEnabled = config.vpcConfig?.igwEnabled !== false;
    const sharedCtx: PlanSharedContext = {
      projectId, config, endpoints, intents, dockerContainers, updatedDockerContainers,
      ipMap, idMap, resolvedCidrs, vpcCidr, isIgwEnabled, sharedNetGateway
    };
    await Promise.all(endpoints.map(ep => this.configureContainerFirewall(ep, sharedCtx)));

    await this.persistCidrCorrections(projectId, config, vpcCidr, resolvedCidrs, ipMap);
  }

  public async cleanupProjectPolicies(projectId: string, endpoints: VirtualEndpoint[]): Promise<void> {
    console.log(`[DockerNetworkProvider] Cleaning up network policies for project: ${projectId}`);
    const dockerContainers = await docker.listContainers({ all: true });

    this.resolveContainerNames(endpoints, dockerContainers);

    for (const ep of endpoints) {
      const containerInfo = dockerContainers.find(c =>
        c.Names.some((name: string) => name.replace(/^\//, '') === ep.containerName)
      );
      if (containerInfo && containerInfo.State === 'running') {
        const containerId = containerInfo.Id;
        const hasIptables = await this.runExec(containerId, ['sh', '-c', 'command -v iptables || true']);
        if (hasIptables && !hasIptables.includes('not found') && hasIptables.trim() !== '') {
          // Flush custom chains
          await this.runExec(containerId, ['iptables', '-F', 'AKAL-INPUT']);
          await this.runExec(containerId, ['iptables', '-F', 'AKAL-OUTPUT']);
        }
      }
    }

    // Clean up all dynamic subnet networks created for this project
    console.log(`[DockerNetworkProvider] Cleaning up subnet networks for project: ${projectId}`);
    try {
      const allNetworks = await docker.listNetworks();
      for (const net of allNetworks) {
        if (net.Name.startsWith(`akal-subnet-${projectId}-`)) {
          console.log(`[DockerNetworkProvider] Deleting network ${net.Name}...`);
          try {
            const network = docker.getNetwork(net.Id);
            const netInspect = await network.inspect();
            const connectedContainers = Object.keys(netInspect.Containers || {});
            for (const cId of connectedContainers) {
              await network.disconnect({ Container: cId, Force: true });
            }
            await network.remove();
          } catch (err) {
            console.error(`Failed to delete network ${net.Name}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to list/clean networks:`, err);
    }
  }

  private async ensureNetwork(netName: string, cidr: string, allNetworks: any[]): Promise<string> {
    const exists = allNetworks.some(n => n.Name === netName);
    if (exists) {
      try {
        const net = docker.getNetwork(netName);
        const inspect = await net.inspect();
        const subnet = inspect.IPAM?.Config?.[0]?.Subnet;
        if (subnet) return subnet;
      } catch {
        // Ignore network inspect error and fallback to default CIDR
      }
      return cidr;
    }

    let currentCidr = cidr;
    let attempts = 0;
    while (attempts < 10) {
      try {
        console.log(`[DockerNetworkProvider] Creating network ${netName} with CIDR ${currentCidr}...`);
        const gateway = currentCidr.replace(/\.0\/\d+$/, '.1');
        await docker.createNetwork({
          Name: netName,
          Driver: 'bridge',
          IPAM: {
            Config: [{
              Subnet: currentCidr,
              Gateway: gateway
            }]
          }
        });
        return currentCidr;
      } catch (err: any) {
        if (err.statusCode === 403 || err.message?.includes('overlaps') || err.message?.includes('pool')) {
          attempts++;
          const secondOctet = 110 + attempts;
          const parts = currentCidr.split('.');
          parts[1] = secondOctet.toString();
          currentCidr = parts.join('.');
          console.warn(`[DockerNetworkProvider] Pool overlap detected. Retrying with shifted CIDR: ${currentCidr}`);
        } else {
          throw err;
        }
      }
    }
    throw new Error(`Failed to create network ${netName} after 10 attempts due to address space overlaps.`);
  }
}
