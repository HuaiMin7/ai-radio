import base64
import json
import sys
import threading
import wave

import dashscope
from dashscope.audio.qwen_tts_realtime import (
    AudioFormat,
    QwenTtsRealtime,
    QwenTtsRealtimeCallback,
)


class WavCallback(QwenTtsRealtimeCallback):
    def __init__(self, output_path):
        super().__init__()
        self.output_path = output_path
        self.audio = bytearray()
        self.done = threading.Event()
        self.error = None

    def on_event(self, response):
        try:
            event_type = response.get("type")

            if event_type == "response.audio.delta":
                self.audio.extend(base64.b64decode(response["delta"]))

            if event_type in {"response.done", "session.finished"}:
                self.done.set()
        except Exception as error:
            self.error = error
            self.done.set()

    def on_close(self, close_status_code, close_msg):
        if not self.done.is_set() and close_status_code not in (1000, None):
            self.error = RuntimeError(f"websocket closed: {close_status_code} {close_msg}")
            self.done.set()

    def wait(self):
        self.done.wait(timeout=40)

        if self.error:
            raise self.error

        if not self.audio:
            raise RuntimeError("Qwen-TTS returned empty audio")

        with wave.open(self.output_path, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(24000)
            wav_file.writeframes(bytes(self.audio))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: qwen-tts-realtime.py request.json")

    with open(sys.argv[1], "r", encoding="utf-8") as file:
        request = json.load(file)

    dashscope.api_key = request["apiKey"]
    callback = WavCallback(request["outputPath"])
    synthesizer = QwenTtsRealtime(
        model=request["model"],
        callback=callback,
        url=request["websocketUrl"],
    )

    synthesizer.connect()
    synthesizer.update_session(
        voice=request["voice"],
        response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
        instructions=request.get("instructions"),
        optimize_instructions=True,
        mode="server_commit",
    )
    synthesizer.append_text(request["text"])
    synthesizer.finish()
    callback.wait()


if __name__ == "__main__":
    main()
