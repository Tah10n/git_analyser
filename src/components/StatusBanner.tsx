type StatusBannerProps = {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  error?: string;
  warning?: string;
};

export const StatusBanner = ({ status, error, warning }: StatusBannerProps) => {
  if (warning && (status === "idle" || status === "ready")) {
    return (
      <section className="status-banner is-warning" role="status">
        <strong>Обратите внимание</strong>
        <span>{warning}</span>
      </section>
    );
  }

  if (status === "idle" || status === "ready") {
    return null;
  }

  const copy = {
    loading: {
      title: "Загружаем историю",
      body: "Получаем метаданные, коммиты, изменения и дерево файлов.",
    },
    empty: {
      title: "Коммиты не найдены",
      body: "В выбранном окне истории этой ветки нет коммитов.",
    },
    error: {
      title: "Ошибка GitHub",
      body: error ?? "Не удалось загрузить историю репозитория.",
    },
  }[status];

  return (
    <section className={`status-banner is-${status}`} role={status === "error" ? "alert" : "status"}>
      <strong>{copy.title}</strong>
      <span>{copy.body}</span>
    </section>
  );
};
