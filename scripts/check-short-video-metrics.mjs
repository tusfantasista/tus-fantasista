import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

let clock = 0;
const requests = [];
globalThis.window = new EventTarget();
globalThis.performance = { now: () => clock };
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  return { status: 204 };
};
const source = await readFile(new URL("../public/assets/js/festa60-video-metrics.js", import.meta.url), "utf8");
const { setVideoMetrics } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
class Player extends EventTarget {
  dataset = {};
  currentTime = 0;
  duration = 10;
  playbackRate = 1;
  paused = true;
  seeking = false;
  start() { this.paused = false; this.dispatchEvent(new Event("playing")); }
  pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
  advance(seconds) {
    clock += seconds / this.playbackRate * 1000;
    this.currentTime = Math.min(this.duration, this.currentTime + seconds);
    this.dispatchEvent(new Event("timeupdate"));
  }
  seek(seconds) {
    this.seeking = true;
    this.dispatchEvent(new Event("seeking"));
    this.currentTime = seconds;
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }
  end() { this.paused = true; this.dispatchEvent(new Event("ended")); }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const playToEnd = (player) => { while (player.currentTime < player.duration) player.advance(0.25); player.end(); };

const full = new Player();
setVideoMetrics(full, "festa60-short-pr01");
full.start(); full.start();
playToEnd(full); full.end();
await flush();
assert.deepEqual(requests.map((event) => event.event), ["start", "complete"]);
assert.equal(new Set(requests.map((event) => event.playback_id)).size, 1);
const firstCompletedPlaybackId = requests[0].playback_id;

requests.length = 0;
full.seek(5); full.start(); playToEnd(full);
await flush();
assert.deepEqual(requests.map((event) => event.event), ["start"], "a replay from the middle starts a new session without inheriting old completion coverage");
assert.notEqual(requests[0].playback_id, firstCompletedPlaybackId);

requests.length = 0;
const tail = new Player();
setVideoMetrics(tail, "festa60-short-h01");
tail.start(); tail.seek(9); playToEnd(tail);
await flush();
assert.deepEqual(requests.map((event) => event.event), ["start"], "a final-second seek must never count as completion");

requests.length = 0;
const switched = new Player();
setVideoMetrics(switched, "festa60-short-pr02");
switched.start(); switched.advance(0.5); switched.pause();
setVideoMetrics(switched, "festa60-short-pr03");
switched.currentTime = 0; switched.start(); playToEnd(switched);
await flush();
assert.deepEqual(requests.map((event) => [event.video_id, event.event]), [
  ["festa60-short-pr02", "start"], ["festa60-short-pr03", "start"], ["festa60-short-pr03", "complete"],
]);
assert.equal(new Set(requests.map((event) => event.playback_id)).size, 2);

requests.length = 0;
const resumed = new Player();
setVideoMetrics(resumed, "festa60-pr");
resumed.start();
for (let n = 0; n < 20; n++) resumed.advance(0.25);
resumed.pause(); clock += 60000; resumed.start(); playToEnd(resumed);
await flush();
assert.deepEqual(requests.map((event) => event.event), ["start", "complete"], "pause/resume preserves coverage without another start");
assert(requests.every((event) => event.video_id === "festa60-pr"), "the published full-version ID remains supported");

requests.length = 0;
const fast = new Player();
fast.playbackRate = 2;
setVideoMetrics(fast, "festa60-short-h14");
fast.start(); playToEnd(fast);
await flush();
assert.deepEqual(requests.map((event) => event.event), ["start", "complete"]);
console.log("PASS: full playback, middle replay starts a fresh session, seek rejection, video switching, pause/resume, double-speed playback");
