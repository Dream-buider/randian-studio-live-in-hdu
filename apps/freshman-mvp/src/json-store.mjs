import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function clone(value) {
  return structuredClone(value);
}

export class JsonStore {
  #path;
  #initial;
  #queue = Promise.resolve();

  constructor(path, initialValue) {
    this.#path = path;
    this.#initial = clone(initialValue);
  }

  async #load() {
    try {
      return JSON.parse(await readFile(this.#path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#save(this.#initial);
      return clone(this.#initial);
    }
  }

  async #save(value) {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.#path);
  }

  async read() {
    await this.#queue;
    return clone(await this.#load());
  }

  update(mutator) {
    const operation = this.#queue.then(async () => {
      const state = await this.#load();
      const result = await mutator(state);
      await this.#save(state);
      return result;
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
}
