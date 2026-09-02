export function createSerializedWriteQueue() {
  let tail = Promise.resolve();

  return {
    enqueue(write) {
      const task = tail.catch(() => undefined).then(write);
      tail = task;
      return task;
    }
  };
}
