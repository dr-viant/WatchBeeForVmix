export function createMockApiClient() {
  const calls = [];

  return {
    // same shape as real client
    async notify(event) {
      calls.push({
        event,
        at: Date.now(),
      });

      // simulate async behavior
      return Promise.resolve({ ok: true });
    },

    // test helpers
    getCalls() {
      return calls.slice();
    },

    reset() {
      calls.length = 0;
    },
  };
}
