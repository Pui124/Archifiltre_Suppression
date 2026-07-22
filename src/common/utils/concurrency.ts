type PendingResolver = () => void;

/**
 * Creates a limiter that runs at most maxConcurrency tasks at the same time.
 * Extra tasks are queued (FIFO) until a slot is released.
 */
export const makeConcurrencyLimiter = (
  maxConcurrency: number
): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let activeCount = 0;
  const pending: PendingResolver[] = [];

  const acquire = async (): Promise<void> => {
    if (activeCount < maxConcurrency) {
      activeCount++;
      return;
    }
    await new Promise<void>((resolve) => {
      pending.push(resolve);
    });
  };

  const release = (): void => {
    const next = pending.shift();
    if (next) {
      // The slot is handed over to the next queued task
      next();
    } else {
      activeCount--;
    }
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
};

/**
 * Maps values with a bounded concurrency pool. Results keep the input order.
 */
export const mapWithConcurrency = async <TInput, TOutput>(
  values: TInput[],
  maxConcurrency: number,
  mapper: (value: TInput) => Promise<TOutput>
): Promise<TOutput[]> => {
  const limit = makeConcurrencyLimiter(maxConcurrency);
  const results = new Array<TOutput>(values.length);

  await Promise.all(
    values.map(async (value, index) =>
      limit(async () => {
        results[index] = await mapper(value);
      })
    )
  );

  return results;
};

/**
 * Rejects if the task has not settled after timeoutMs. The underlying
 * operation is not aborted: only the awaiting caller is released.
 */
export const withTimeout = async <T>(
  task: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
