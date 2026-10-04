const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (_) {
      clients.delete(res);
    }
  }
}

const counters = {
  cbsReads: 0,
  redisReads: 0,
  redisWrites: 0,
  streamsPublished: 0,
  streamsConsumed: 0,
  fraudDecisions: 0,
  reconMatched: 0,
  reconExceptions: 0,
};

export const metrics = {
  inc(k, n = 1) {
    counters[k] = (counters[k] || 0) + n;
  },
  snapshot() {
    return { ...counters, ts: Date.now() };
  },
};
