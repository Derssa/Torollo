import { ValidatorHandler } from '../types';
import { requireStringParam, requireNumberParam } from '../params';

/**
 * `http_get_contains` — sends an HTTP GET request to localhost inside a container
 * and checks if the response body contains a specific string.
 * Params: `{ node: string, port: number, path: string, expectedText: string }`
 */
export const httpGetContains: ValidatorHandler = async (params, ctx) => {
  const node = requireStringParam(params, 'node');
  const port = requireNumberParam(params, 'port');
  const path = requireStringParam(params, 'path');
  const expectedText = requireStringParam(params, 'expectedText');

  const containers = await ctx.getContainers();
  const container = containers.find(c => c.name === node);

  if (!container) {
    return {
      status: 'fail',
      message: `No container named "${node}" exists in this project yet.`,
      expected: `a running container named "${node}"`,
      observed: 'no container with that name',
    };
  }

  if (container.state !== 'running') {
    return {
      status: 'fail',
      message: `The container "${node}" is not running.`,
      expected: 'running',
      observed: container.state,
    };
  }

  try {
    // Run curl inside the target container to retrieve the page content
    const url = `http://localhost:${port}${path}`;
    const output = await ctx.executeCustomCommand(container.id, ['curl', '-s', url]);

    if (!output || output.includes('Failed to connect') || output.includes('Connection refused')) {
      return {
        status: 'fail',
        message: `Could not connect to the web server on port ${port} inside container "${node}". Make sure your server is started and listening.`,
        expected: `a successful response from ${url}`,
        observed: output || 'no response (connection refused)',
      };
    }

    if (!output.includes(expectedText)) {
      return {
        status: 'fail',
        message: `The web server at ${url} did not return the expected content.`,
        expected: `response body containing "${expectedText}"`,
        observed: output.length > 200 ? output.substring(0, 200) + '...' : output,
      };
    }

    return {
      status: 'pass',
      message: `Successfully connected to ${url} and verified the response contains "${expectedText}".`,
    };
  } catch (err: unknown) {
    return {
      status: 'fail',
      message: `Failed to communicate with the web server: ${(err as Error).message}`,
      expected: `response containing "${expectedText}"`,
      observed: `error: ${(err as Error).message}`,
    };
  }
};
