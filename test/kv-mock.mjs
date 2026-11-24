export class MockKV {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.writes = [];
  }

  async get(key) {
    if (key === this.readFailure) throw new Error("offline read failure");
    return this.values.has(key) ? this.values.get(key) : null;
  }

  async put(key, value) {
    this.writes.push(key);
    if (key === this.writeFailure) throw new Error("offline write failure");
    this.values.set(key, value);
  }
}
