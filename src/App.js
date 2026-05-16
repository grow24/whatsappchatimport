import React, { useState } from "react";
import JSZip from "jszip";

function parseTimestamp(dateStr, timeStr) {
  const [day, month, year] = dateStr.split("/").map(Number);
  let [hours, minutes] = [0, 0];
  const hasAmPm = /am|pm/i.test(timeStr);

  if (hasAmPm) {
    const normalized = timeStr.trim().toLowerCase();
    const ampm = normalized.slice(-2);
    const [h, m] = normalized.replace(/am|pm/g, "").trim().split(":").map(Number);
    hours = h;
    minutes = m;
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else {
    [hours, minutes] = timeStr.split(":").map(Number);
  }

  return new Date(year, month - 1, day, hours, minutes).toISOString();
}

async function parseZipLocally(file) {
  const zip = await JSZip.loadAsync(file);
  const txtEntryName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith(".txt"));
  if (!txtEntryName) {
    return { messages: [], error: "No .txt chat file found in ZIP." };
  }

  const chatText = await zip.files[txtEntryName].async("string");
  const headerRe =
    /^(\d{1,2}\/\d{1,2}\/\d{4}),\s(\d{1,2}:\d{2}(?:\s?(?:am|pm))?)\s[-–]\s([^:]+?):\s(.*)$/i;
  const lines = chatText.replace(/\uFEFF/g, "").split(/\r?\n/);
  const messages = [];
  let last = null;

  for (const raw of lines) {
    if (!raw) continue;
    const match = raw.match(headerRe);
    if (match) {
      const [, date, time, sender, message] = match;
      const text = message || "";
      if (/^Messages and calls are end-to-end encrypted/i.test(text)) continue;
      const msg = {
        timestamp: parseTimestamp(date, time),
        sender: sender.trim(),
        message: text,
      };
      messages.push(msg);
      last = msg;
      continue;
    }

    if (last) {
      last.message = `${last.message ? `${last.message}\n` : ""}${raw}`;
    }
  }

  return { messages };
}

export default function Upload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a ZIP file");
      return;
    }

    const formData = new FormData();
    // n8n workflows often expect binary data under either "data" or "file".
    // Sending both avoids binary-property mismatches in downstream nodes.
    formData.append("data", file, file.name);
    formData.append("file", file, file.name);
    formData.append("name", name.trim());
    formData.append("username", name.trim());

    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("http://localhost:5678/webhook/zipfile", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type") || "";
      const rawBody = await res.text();
      let payload = rawBody;
      if (contentType.includes("application/json") && rawBody.trim() !== "") {
        try {
          payload = JSON.parse(rawBody);
        } catch (_parseErr) {
          // Some webhook flows incorrectly set JSON content-type for plain text bodies.
          // Keep payload as text instead of failing on client-side parsing.
          payload = rawBody;
        }
      }

      if (!res.ok) {
        const details =
          typeof payload === "string"
            ? payload.slice(0, 200)
            : JSON.stringify(payload).slice(0, 200);
        throw new Error(`HTTP ${res.status}: ${details || "Upload failed"}`);
      }

      const data =
        payload && (Array.isArray(payload) || typeof payload === "object") ? payload : {};
      console.log("Response from n8n:", payload);

      if (Array.isArray(data) && data[0]?.messages) {
        setMessages(data[0].messages);
        setStatus(`Loaded ${data[0].messages.length} messages.`);
      } else if (data.messages) {
        setMessages(data.messages);
        setStatus(`Loaded ${data.messages.length} messages.`);
      } else {
        const fallback = await parseZipLocally(file);
        if (fallback.messages.length > 0) {
          setMessages(fallback.messages);
          setStatus(
            `Webhook returned empty response, loaded ${fallback.messages.length} messages via local ZIP parsing.`
          );
        } else if (rawBody.trim() === "") {
          setMessages([]);
          setStatus(
            fallback.error ||
              "Upload succeeded, but webhook returned an empty response body."
          );
        } else {
          setMessages([]);
          setStatus(`Upload succeeded, but no message list found in response: ${rawBody.slice(0, 160)}`);
        }
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setStatus(`Upload failed: ${err.message}`);
      alert(`Upload failed: ${err.message}`);
    }
    setLoading(false);
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, msg) => {
    const dateKey = new Date(msg.timestamp).toLocaleDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <h2 className="text-lg font-bold mb-3">Upload WhatsApp Chat ZIP</h2>
        <input
          type="file"
          accept=".zip"
          className="mb-4"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <input
          type="text"
          placeholder="Enter your WhatsApp name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border p-2 rounded mb-4 block"
        />
        <button
          onClick={handleUpload}
          disabled={loading}
          className={`px-4 py-2 rounded-lg text-white ${
            loading ? "bg-gray-400" : "bg-green-500 hover:bg-green-600"
          }`}
        >
          {loading ? "Uploading..." : "Upload"}
        </button>
        {status && <p className="mt-3 text-sm text-gray-700">{status}</p>}
      </div>

      {/* Chat Section */}
      <div className="bg-white rounded-lg shadow-md p-4 max-w-2xl mx-auto">
        <h3 className="text-md font-semibold mb-4">Chat Preview</h3>
        <div className="space-y-6">
          {messages.length === 0 ? (
            <p className="text-gray-500">No messages yet.</p>
          ) : (
            Object.entries(groupedMessages).map(([date, msgsForDate], dateIdx) => (
              <div key={dateIdx}>
                {/* Date Separator */}
                <div className="flex justify-center my-4">
                  <span className="bg-gray-300 text-gray-800 text-xs px-3 py-1 rounded-full">
                    {date}
                  </span>
                </div>

                {/* Messages */}
                {msgsForDate.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${
                      msg.sender === name ? "justify-end" : "justify-start"
                    } mb-2`}
                  >
                    <div
                      className={`px-3 py-2 rounded-lg max-w-xs break-words ${
                        msg.sender === name
                          ? "bg-green-500 text-white"
                          : "bg-gray-200 text-gray-900"
                      }`}
                    >
                      {/* Sender name (only for incoming messages or group view) */}
                      {msg.sender !== name && (
                        <p className="text-xs font-semibold mb-1">{msg.sender}</p>
                      )}

                      {/* Text message */}
                     {/* Text message */}
{msg.message && msg.message.trim() !== "" && (
  <p className="text-sm whitespace-pre-wrap break-words">
    {msg.message}
  </p>
)}

{/* Image */}
{msg.media &&
  msg.media.mimeType?.startsWith("image/") &&
  msg.media.base64 && (
    <>
      <img
        src={`data:${msg.media.mimeType};base64,${msg.media.base64}`}
        alt={msg.media.filename || "Image"}
        className="mt-2 rounded-lg max-w-full"
      />
      {msg.caption && (
        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
          {msg.caption}
        </p>
      )}
    </>
  )}

{/* Video */}
{msg.media &&
  msg.media.mimeType?.startsWith("video/") &&
  msg.media.base64 && (
    <>
      <video
        controls
        className="mt-2 rounded-lg max-w-full"
      >
        <source
          src={`data:${msg.media.mimeType};base64,${msg.media.base64}`}
          type={msg.media.mimeType}
        />
        Your browser does not support the video tag.
      </video>
      {msg.caption && (
        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
          {msg.caption}
        </p>
      )}
    </>
  )}

{/* File / Document */}
{msg.media &&
  !msg.media.mimeType?.startsWith("image/") &&
  !msg.media.mimeType?.startsWith("video/") &&
  msg.media.base64 && (
    <>
      <a
        href={`data:${msg.media.mimeType};base64,${msg.media.base64}`}
        download={msg.media.filename || "file"}
        className="mt-2 inline-block text-blue-600 underline text-sm break-all"
      >
        📄 {msg.media.filename || "Download file"}
      </a>
      {msg.caption && (
        <p className="text-sm mt-1 whitespace-pre-wrap break-words">
          {msg.caption}
        </p>
      )}
    </>
  )}

                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
