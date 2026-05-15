type StatusBannerProps = {
  status: "idle" | "loading" | "ready" | "empty" | "error";
  error?: string;
};

export const StatusBanner = ({ status, error }: StatusBannerProps) => {
  if (status === "idle" || status === "ready") {
    return null;
  }

  const copy = {
    loading: {
      title: "Loading repository history",
      body: "Fetching metadata, commits, changed files, and the seed tree.",
    },
    empty: {
      title: "No commits returned",
      body: "The selected branch did not return commits for this bounded window.",
    },
    error: {
      title: "GitHub request failed",
      body: error ?? "Unable to load repository history.",
    },
  }[status];

  return (
    <section className={`status-banner is-${status}`} role={status === "error" ? "alert" : "status"}>
      <strong>{copy.title}</strong>
      <span>{copy.body}</span>
    </section>
  );
};
