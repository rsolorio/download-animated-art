import { exec } from 'child_process';
import { get, RequestOptions } from 'https';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export function runCommand(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      else if (stderr) {
        reject(stderr);
      }
      else {
        resolve(stdout);
      }
    });
  });
}

export function httpGet(url: string, options: RequestOptions): Promise<any> {
  return new Promise<any>((resolve, reject) => {
    get(url, options, response => {
      const chunks: any[] = [];
      response.on('data', chunk => {
        chunks.push(chunk);
      });
      response.on('end', () => {
        response['text'] = Buffer.concat(chunks).toString();
        resolve(response);
      });
    });
  });
}

export function createDirectory(directoryName: string): void {
  const directoryPath = join(process.cwd(), directoryName);
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, {recursive: true });
  }
}

export function buildPath(...paths: string[]): string {
  paths.unshift(process.cwd());
  return join(...paths);
}