import { getSubnetPrefix, getDockerGatewayIp, getNatGatewayIp, resolveVpcCidrShift } from './subnetAddressing';

describe('getSubnetPrefix', () => {
  it('extracts the dotted third-octet prefix', () => {
    expect(getSubnetPrefix('10.0.1.0/24')).toBe('10.0.1.');
  });

  it('returns empty string for an unparseable CIDR', () => {
    expect(getSubnetPrefix('not-a-cidr')).toBe('');
  });
});

describe('getDockerGatewayIp', () => {
  it('returns prefix + .1', () => {
    expect(getDockerGatewayIp('10.0.1.0/24')).toBe('10.0.1.1');
  });

  it('returns empty string when the CIDR is unparseable', () => {
    expect(getDockerGatewayIp('bogus')).toBe('');
  });
});

describe('getNatGatewayIp', () => {
  it('returns prefix + .254', () => {
    expect(getNatGatewayIp('10.0.1.0/24')).toBe('10.0.1.254');
  });

  it('returns empty string when the CIDR is unparseable', () => {
    expect(getNatGatewayIp('bogus')).toBe('');
  });
});

describe('resolveVpcCidrShift', () => {
  it('returns the original VPC CIDR when no subnet was resolved yet', () => {
    expect(resolveVpcCidrShift('10.0.0.0/16', undefined)).toBe('10.0.0.0/16');
  });

  it('shifts the VPC CIDR second octet to track a subnet moved on overlap', () => {
    expect(resolveVpcCidrShift('10.0.0.0/16', '10.112.1.0/24')).toBe('10.112.0.0/16');
  });

  it('leaves the VPC CIDR untouched when the resolved subnet did not shift', () => {
    expect(resolveVpcCidrShift('10.0.0.0/16', '10.0.1.0/24')).toBe('10.0.0.0/16');
  });
});
