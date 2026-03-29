export const ACTION_PASSWORD = "Yokoi";

export const requestActionPassword = (message = "パスワードを入力してください") => {
  if (typeof window === "undefined") {
    return false;
  }

  const input = window.prompt(message, "");
  if (input === null) {
    return false;
  }

  return input === ACTION_PASSWORD;
};
