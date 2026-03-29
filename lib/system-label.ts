export const createSystemName = (prefix: string) => {
  const now = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${prefix} ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
};
