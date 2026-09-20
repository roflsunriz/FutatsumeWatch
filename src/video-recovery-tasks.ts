/** 動画が変わった後のエラー応答と再試行を破棄する。 */
export class VideoRecoveryTasks {
  private generation = 0;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  reset(): void {
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  async read<T>(load: () => Promise<T>): Promise<T | undefined> {
    const generation = this.generation;
    try {
      const value = await load();
      return generation === this.generation ? value : undefined;
    } catch (error) {
      if (generation === this.generation) throw error;
      return undefined;
    }
  }

  schedule(action: () => void, delay = 3000): void {
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation === this.generation) action();
    }, delay);
    this.timers.add(timer);
  }
}
