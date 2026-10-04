import { useEffect, useRef, useState } from 'react';

export function useSSE(eventTypes = []) {
  const [events, setEvents] = useState([]);
  const [latest, setLatest] = useState({});
  const ref = useRef(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    ref.current = es;
    const handler = (type) => (e) => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        data = e.data;
      }
      setEvents((prev) => [{ type, data, ts: Date.now() }, ...prev].slice(0, 200));
      setLatest((prev) => ({ ...prev, [type]: data }));
    };
    eventTypes.forEach((t) => es.addEventListener(t, handler(t)));
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, latest };
}
