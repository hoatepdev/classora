const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

export function formatCompensationDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value);
  if (!dateOnly) return dateFormatter.format(new Date(value));

  return dateFormatter.format(
    new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])),
  );
}
