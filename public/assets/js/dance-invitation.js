// Attach the video URL only after the visitor asks to watch it.
// The ordinary file link remains usable when JavaScript or playback fails.
document.querySelectorAll("[data-invitation-player]").forEach((player) => {
  const button = player.querySelector("[data-invitation-play]");
  const cover = player.querySelector("[data-invitation-cover]");
  const video = player.querySelector("video[data-video-src]");
  const status = player.querySelector("[data-invitation-status]");
  if (!button || !cover || !video) return;

  button.hidden = false;
  const showError = () => {
    if (status) status.textContent = "動画を再生できません。「動画を開く」からご覧ください。";
  };
  video.addEventListener("error", showError);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.hidden = true;
    video.src = video.dataset.videoSrc;
    cover.hidden = true;
    video.hidden = false;
    video.focus();
    try {
      await video.play();
    } catch {
      if (status) status.textContent = "動画の再生ボタンを押してください。再生できない場合は「動画を開く」をご利用ください。";
    }
  }, { once: true });
});
