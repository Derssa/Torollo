import { classifyDockerError, sendDockerError, ContainerNotFoundError } from './dockerErrors';

describe('classifyDockerError', () => {
  it.each([
    ['ECONNREFUSED on the socket', { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED /var/run/docker.sock' }],
    ['ENOENT on the docker socket', { code: 'ENOENT', message: 'connect ENOENT /var/run/docker.sock' }],
    ['EACCES on the docker socket', { code: 'EACCES', message: 'connect EACCES /var/run/docker.sock' }],
    ['EPIPE', { code: 'EPIPE', message: 'write EPIPE' }],
  ])('classifies %s as DOCKER_UNAVAILABLE (503)', (_label, err) => {
    const result = classifyDockerError(err);
    expect(result.code).toBe('DOCKER_UNAVAILABLE');
    expect(result.httpStatus).toBe(503);
    expect(result.userMessage).toContain('Docker daemon');
  });

  it('does not treat an unrelated ENOENT (plain fs error) as a daemon failure', () => {
    const result = classifyDockerError({ code: 'ENOENT', syscall: 'open', message: "ENOENT: no such file or directory, open '/data/projects.json'" });
    expect(result.code).toBe('DOCKER_ERROR');
  });

  it('treats a connect ENOENT on a custom socket path (no "docker" in it) as a daemon failure', () => {
    const result = classifyDockerError({ code: 'ENOENT', syscall: 'connect', message: 'connect ENOENT /run/user/1000/podman/podman.sock' });
    expect(result.code).toBe('DOCKER_UNAVAILABLE');
  });

  it.each([
    ['pull failure without statusCode', { message: 'pull access denied for nosuchimage, repository does not exist' }],
    ['manifest unknown', { message: 'manifest unknown: manifest unknown' }],
    ['404 no such image', { statusCode: 404, message: '(HTTP code 404) no such image - No such image: ghost:latest' }],
  ])('classifies %s as IMAGE_NOT_FOUND (502)', (_label, err) => {
    const result = classifyDockerError(err);
    expect(result.code).toBe('IMAGE_NOT_FOUND');
    expect(result.httpStatus).toBe(502);
    expect(result.userMessage).toContain('image');
  });

  it('classifies a port conflict (reported as a 500 by the engine) as PORT_IN_USE (409)', () => {
    const result = classifyDockerError({
      statusCode: 500,
      message: 'driver failed programming external connectivity: Bind for 0.0.0.0:8080 failed: port is already allocated',
    });
    expect(result.code).toBe('PORT_IN_USE');
    expect(result.httpStatus).toBe(409);
    expect(result.userMessage).toContain('port');
  });

  it('classifies statusCode 409 as NAME_CONFLICT', () => {
    const result = classifyDockerError({ statusCode: 409, message: 'Conflict. The container name "/lab-x" is already in use' });
    expect(result).toMatchObject({ code: 'NAME_CONFLICT', httpStatus: 409 });
  });

  it('classifies 404 "no such container" as CONTAINER_NOT_FOUND', () => {
    const result = classifyDockerError({ statusCode: 404, message: '(HTTP code 404) no such container - No such container: abc123' });
    expect(result).toMatchObject({ code: 'CONTAINER_NOT_FOUND', httpStatus: 404 });
  });

  it('classifies ContainerNotFoundError identically to a missing container (no existence leak)', () => {
    const denied = classifyDockerError(new ContainerNotFoundError('abc123'));
    const missing = classifyDockerError({ statusCode: 404, message: '(HTTP code 404) no such container - No such container: abc123' });
    expect(denied).toEqual(missing);
    expect(denied).toMatchObject({ code: 'CONTAINER_NOT_FOUND', httpStatus: 404 });
  });

  it('hides the raw engine message behind a generic one when the error has a statusCode', () => {
    const raw = 'OCI runtime create failed: some scary internal dump';
    const result = classifyDockerError({ statusCode: 500, message: raw }, 'starting the container');
    expect(result.code).toBe('DOCKER_ERROR');
    expect(result.httpStatus).toBe(500);
    expect(result.userMessage).not.toContain(raw);
    expect(result.userMessage).toContain('starting the container');
  });

  it('passes through the message of app-level errors (no statusCode)', () => {
    const result = classifyDockerError(new Error('ERROR: Redis server is still starting up. Please wait 5-10 seconds.'));
    expect(result.code).toBe('DOCKER_ERROR');
    expect(result.userMessage).toContain('still starting up');
  });

  it('falls back to the generic message when the error has no message at all', () => {
    const result = classifyDockerError(undefined);
    expect(result.code).toBe('DOCKER_ERROR');
    expect(result.userMessage).toContain('Something went wrong in Docker');
  });
});

describe('sendDockerError', () => {
  function mockRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('answers { success: true } for 304 no-ops (already started/stopped)', () => {
    const res = mockRes();
    sendDockerError(res, { statusCode: 304, message: 'container already started' });
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers the classified status, message and code', () => {
    const res = mockRes();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    sendDockerError(res, { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED /var/run/docker.sock' }, 'starting the container');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('Docker daemon'),
      code: 'DOCKER_UNAVAILABLE',
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
