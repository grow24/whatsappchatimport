import React, { useState } from "react";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [name, setName] = useState("");

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a ZIP file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const res = await fetch("http://localhost:5678/webhook/zipfile", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const data = await res.json();
      console.log("JSON from n8n:", data);

      if (Array.isArray(data) && data[0]?.messages) {
        setMessages(data[0].messages);
      } else if (data.messages) {
        setMessages(data.messages);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed — check console.");
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
