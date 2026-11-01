/**
 * 独占：macOS 系统应用自动化与原生交互
 */
export function revealInFinder(filePath: string): void {
  if (typeof Application === 'undefined') return;
  try {
    const finder = Application('Finder');
    finder.activate();
    finder.reveal(Path(filePath));
  } catch (e) {
    // 忽略非交互环境下的 Finder 报错
  }
}