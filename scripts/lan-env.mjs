#!/usr/bin/env node
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const ip = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

if (!ip) {
  console.error('Nenhum IPv4 de rede local encontrado. Conecte-se a uma rede e tente de novo.');
  process.exit(1);
}

const [, , ...command] = process.argv;

if (command.length === 0) {
  console.log(ip);
  process.exit(0);
}

console.log(`\nAcesse do celular (mesma rede Wi-Fi): http://${ip}:4200\n`);

const child = spawn(command[0], command.slice(1), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    WEB_URL: `http://${ip}:4200`,
    BETTER_AUTH_URL: `http://${ip}:3000`,
    TRUSTED_ORIGINS: `http://${ip}:4200,http://localhost:4200`,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
