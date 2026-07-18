import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 23233,
  HOST: process.env.TOROLLO_HOST || '127.0.0.1',
  NODE_ENV: process.env.NODE_ENV || 'development',
  DOCKER_SOCKET: process.env.DOCKER_SOCKET || (process.platform === 'win32' 
    ? '//./pipe/docker_engine' 
    : '/var/run/docker.sock')
};
