import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  FaPhoneSlash,
  FaRandom,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaComment,
  FaThumbsUp,
  FaThumbsDown,
  FaRegSmile,
} from "react-icons/fa";
import { IoSend } from "react-icons/io5";

interface Message {
  sender: "me" | "partner";
  text: string;
  timestamp: Date;
}

interface Interest {
  id: string;
  name: string;
  selected: boolean;
}

const INTEREST_OPTIONS = [
  "Technology",
  "Gaming",
  "Music",
  "Sports",
  "Travel",
  "Movies",
  "Cooking",
  "Art",
  "Fitness",
  "Reading",
];

const VideoChat = () => {
  const [status, setStatus] = useState("Connecting to server...");
  const [isCallActive, setIsCallActive] = useState(false);
  const [isInitiator, setIsInitiator] = useState(false);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [remoteStreamReady, setRemoteStreamReady] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [showChat, setShowChat] = useState(true); // Chat visible by default
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [interests, setInterests] = useState<Interest[]>(
    INTEREST_OPTIONS.map((interest) => ({
      id: Math.random().toString(36).substring(7),
      name: interest,
      selected: false,
    }))
  );
  const [commonInterests, setCommonInterests] = useState<string[]>([]);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const [connectionTime, setConnectionTime] = useState(0);
  const [showInterestSelection, setShowInterestSelection] = useState(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const socketRef = useRef<Socket>();
  const peerConnectionRef = useRef<RTCPeerConnection>();
  const localStreamRef = useRef<MediaStream>();
  const remoteStreamRef = useRef<MediaStream>();

  const roomIdRef = useRef<string>();
  const userIdRef = useRef<string>();
  const partnerIdRef = useRef<string>();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const connectionTimerRef = useRef<NodeJS.Timeout>();

  // Toggle interest selection
  const toggleInterest = (id: string) => {
    setInterests((prev) =>
      prev.map((interest) =>
        interest.id === id
          ? { ...interest, selected: !interest.selected }
          : interest
      )
    );
  };

  // Get selected interests
  const getSelectedInterests = () => {
    return interests.filter((i) => i.selected).map((i) => i.name);
  };

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Start connection timer
  const startConnectionTimer = () => {
    setConnectionTime(0);
    connectionTimerRef.current = setInterval(() => {
      setConnectionTime((prev) => prev + 1);
    }, 1000);
  };

  // Stop connection timer
  const stopConnectionTimer = () => {
    if (connectionTimerRef.current) {
      clearInterval(connectionTimerRef.current);
    }
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Send chat message
  const sendMessage = () => {
    if (message.trim() && roomIdRef.current) {
      const newMessage: Message = {
        sender: "me",
        text: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, newMessage]);
      socketRef.current?.emit("chat_message", roomIdRef.current, message);
      setMessage("");
      scrollToBottom();
    }
  };

  // Handle incoming chat message
  const handleChatMessage = (text: string) => {
    const newMessage: Message = {
      sender: "partner",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMessage]);
    scrollToBottom();
  };

  // Handle typing indicator
  const handleTyping = (isTyping: boolean) => {
    setPartnerTyping(isTyping);
  };

  // Send typing status
  const sendTyping = (isTyping: boolean) => {
    if (roomIdRef.current) {
      socketRef.current?.emit("typing", roomIdRef.current, isTyping);
    }
  };

  // Like/dislike partner
  const ratePartner = (like: boolean) => {
    setLiked(like);
    if (roomIdRef.current) {
      socketRef.current?.emit("rate_partner", roomIdRef.current, like);
    }
  };

  // Share interests
  const shareInterests = (interests: string[]) => {
    if (roomIdRef.current) {
      socketRef.current?.emit("share_interests", roomIdRef.current, interests);
    }
  };

  // Handle incoming interests
  const handlePartnerInterests = (interests: string[]) => {
    setPartnerInterests(interests);
    const selected = getSelectedInterests();
    if (interests.length > 0 && selected.length > 0) {
      const common = interests.filter((int) => selected.includes(int));
      setCommonInterests(common);
    }
  };

  // Handle partner rating
  const handlePartnerRating = (rating: boolean) => {
    setStatus(rating ? "Partner liked you! ❤️" : "Partner disliked you 💔");
    setTimeout(() => {
      endCall();
    }, 2000);
  };

  // Update when typing
  useEffect(() => {
    if (message.trim()) {
      sendTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(false);
      }, 1000);
    } else {
      sendTyping(false);
    }
  }, [message]);

  // Attach local stream when video element is mounted
  useEffect(() => {
    if (localStreamReady && localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [localStreamReady]);

  // Create peer connection
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        // Add your TURN server configuration here for production
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && roomIdRef.current) {
        socketRef.current?.emit("webrtc_ice", roomIdRef.current, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
          remoteVideoRef.current.onloadedmetadata = () => {
            remoteVideoRef.current
              ?.play()
              .catch((e) => console.error("Error playing remote video:", e));
          };
        }
        setRemoteStreamReady(true);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    return pc;
  };

  // Set up WebRTC connection
  const setupWebRTC = async (initiator: boolean) => {
    try {
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (pc.localDescription) {
          socketRef.current?.emit("webrtc_offer", roomIdRef.current, {
            sdp: pc.localDescription.sdp,
            type: pc.localDescription.type,
          });
        }
      }
    } catch (err) {
      console.error("WebRTC setup error:", err);
      setStatus("Error setting up video call");
      cleanup();
    }
  };

  // Handle remote offer
  const handleRemoteOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      await setupWebRTC(false);
    }

    try {
      await peerConnectionRef.current?.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peerConnectionRef.current!.createAnswer();
      await peerConnectionRef.current?.setLocalDescription(answer);

      if (peerConnectionRef.current?.localDescription) {
        socketRef.current?.emit("webrtc_answer", roomIdRef.current, {
          sdp: peerConnectionRef.current.localDescription.sdp,
          type: peerConnectionRef.current.localDescription.type,
        });
      }
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  };

  // Handle remote answer
  const handleRemoteAnswer = async (answer: RTCSessionDescriptionInit) => {
    try {
      await peerConnectionRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  };

  // Handle ICE candidate
  const handleICECandidate = async (candidate: RTCIceCandidateInit) => {
    try {
      await peerConnectionRef.current?.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  };

  // Initialize media devices
  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;
      setLocalStreamReady(true);
      return true;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setStatus(
        "Could not access camera/microphone. Please check permissions."
      );
      return false;
    }
  };

  // Start a new call
  const startCall = async () => {
    const selectedInterests = getSelectedInterests();
    if (selectedInterests.length === 0) {
      setStatus("Please select at least one interest");
      return;
    }

    setStatus("Looking for a partner...");
    setShowInterestSelection(false);
    const mediaSuccess = await initializeMedia();
    if (mediaSuccess) {
      socketRef.current?.emit("join_random", selectedInterests);
    }
  };

  // End the current call
  const endCall = async () => {
    try {
      if (roomIdRef.current && userIdRef.current) {
        await fetch(
          `${
            process.env.REACT_APP_API_URL || "http://localhost:5001"
          }/api/end-call`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId: roomIdRef.current,
              userId: userIdRef.current,
            }),
          }
        );
      }
    } catch (err) {
      console.error("Error ending call:", err);
    } finally {
      cleanup();
      setStatus("Call ended. Ready to sync again!");
      setIsCallActive(false);
      stopConnectionTimer();
      setShowInterestSelection(true);
    }
  };

  // Clean up resources
  const cleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = undefined;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = undefined;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = undefined;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setLocalStreamReady(false);
    setRemoteStreamReady(false);
    setMessages([]);
    setLiked(null);
    setCommonInterests([]);
    setPartnerInterests([]);
  };

  // Toggle audio mute
  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsAudioMuted(!isAudioMuted);
    }
  };

  // Toggle video mute
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoMuted(!isVideoMuted);
    }
  };

  // Initialize socket connection
  useEffect(() => {
    const socket = io(
      process.env.REACT_APP_API_URL || "http://localhost:5001",
      {
        transports: ["websocket"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
        timeout: 20000,
      }
    );

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Connected. Ready to sync!");
    });

    socket.on("your_id", (id: string) => {
      userIdRef.current = id;
    });

    socket.on(
      "partner_found",
      (data: {
        roomId: string;
        partnerId: string;
        isInitiator: boolean;
        partnerInterests?: string[];
        commonInterests?: string[];
      }) => {
        roomIdRef.current = data.roomId;
        partnerIdRef.current = data.partnerId;
        setIsInitiator(data.isInitiator);
        setStatus(`Connected with partner: ${data.partnerId.substring(0, 8)}`);
        setIsCallActive(true);
        if (data.partnerInterests) {
          handlePartnerInterests(data.partnerInterests);
        }
        if (data.commonInterests) {
          setCommonInterests(data.commonInterests);
        }
        setupWebRTC(data.isInitiator);
        startConnectionTimer();
        shareInterests(getSelectedInterests());
      }
    );

    socket.on("partner_left", () => {
      setStatus("Partner disconnected. Ready to sync again!");
      cleanup();
      setIsCallActive(false);
      stopConnectionTimer();
      setShowInterestSelection(true);
    });

    socket.on("chat_message", handleChatMessage);
    socket.on("typing", handleTyping);
    socket.on("partner_rated", handlePartnerRating);
    socket.on("partner_interests", handlePartnerInterests);

    socket.on("webrtc_offer", handleRemoteOffer);
    socket.on("webrtc_answer", handleRemoteAnswer);
    socket.on("webrtc_ice", handleICECandidate);

    socket.on("disconnect", () => {
      setStatus("Disconnected from server. Reconnecting...");
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      setStatus("Connection error. Trying to reconnect...");
    });

    return () => {
      socket.disconnect();
      cleanup();
      stopConnectionTimer();
    };
  }, []);

  return (
    <div className="bg-gradient-to-br from-purple-100 via-blue-100 to-white p-4 md:p-6 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white rounded-3xl shadow-2xl p-6">
        <h1 className="text-2xl font-bold text-blue-600 cursor-pointer text-center">
          ⚡SyncTalk - Instant Random Video Chats
        </h1>

        <p className="text-center text-gray-600 mb-6">
          Meet someone new with just one click. Secure, peer-to-peer video chats
        </p>

        {commonInterests.length > 0 && (
          <div className="mb-2 text-center">
            <span className="text-sm text-blue-600">
              You both like: {commonInterests.join(", ")}
            </span>
          </div>
        )}

        <div className="mb-4 p-4 bg-blue-100 border border-blue-300 rounded-lg shadow-sm">
          <p className="text-center font-semibold text-blue-700">
            {status} {isCallActive && `(${formatTime(connectionTime)})`}
          </p>
          {partnerTyping && (
            <p className="text-center text-sm text-gray-600">
              Partner is typing...
            </p>
          )}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main video/content area */}
          <div className="flex-1">
            {showInterestSelection && (
              <div className="mb-6 p-6 bg-gray-50 rounded-xl">
                <h2 className="text-lg font-semibold mb-4 text-center">
                  Select your interests to find better matches
                </h2>
                <div className="flex flex-wrap justify-center gap-2">
                  {interests.map((interest) => (
                    <button
                      key={interest.id}
                      onClick={() => toggleInterest(interest.id)}
                      className={`px-4 py-2 rounded-full transition ${
                        interest.selected
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                      }`}
                    >
                      {interest.name}
                    </button>
                  ))}
                </div>
                <div className="mt-6 text-center">
                  <button
                    onClick={startCall}
                    disabled={getSelectedInterests().length === 0}
                    className={`flex items-center justify-center mx-auto px-6 py-3 rounded-xl text-white ${
                      getSelectedInterests().length === 0
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-500 hover:bg-green-600"
                    } transition shadow-lg`}
                  >
                    <FaRandom className="mr-2" />
                    Start Sync with Matching Interests
                  </button>
                </div>
              </div>
            )}

            <div
              className={`grid ${
                isCallActive ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
              } gap-4 mb-6`}
            >
              {isCallActive && (
                <div className="bg-black rounded-2xl overflow-hidden aspect-video relative">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {liked !== null && (
                    <div className="absolute top-4 right-4 bg-white bg-opacity-70 rounded-full p-2">
                      {liked ? (
                        <FaThumbsUp className="text-green-500 text-xl" />
                      ) : (
                        <FaThumbsDown className="text-red-500 text-xl" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {localStreamReady && (
                <div className="bg-black rounded-2xl overflow-hidden aspect-video shadow-md relative">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            {localStreamReady && (
              <div className="flex justify-center space-x-4 mb-6">
                <button
                  onClick={toggleAudio}
                  className={`flex items-center px-4 py-2 rounded-xl transition shadow-md ${
                    isAudioMuted ? "bg-gray-600" : "bg-blue-600"
                  } text-white hover:opacity-90`}
                >
                  {isAudioMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                  <span className="ml-2">
                    {isAudioMuted ? "Unmute" : "Mute"}
                  </span>
                </button>

                <button
                  onClick={toggleVideo}
                  className={`flex items-center px-4 py-2 rounded-xl transition shadow-md ${
                    isVideoMuted ? "bg-gray-600" : "bg-blue-600"
                  } text-white hover:opacity-90`}
                >
                  {isVideoMuted ? <FaVideoSlash /> : <FaVideo />}
                  <span className="ml-2">
                    {isVideoMuted ? "Show Video" : "Hide Video"}
                  </span>
                </button>

                <button
                  onClick={() => setShowChat(!showChat)}
                  className={`flex items-center px-4 py-2 rounded-xl transition shadow-md ${
                    showChat ? "bg-blue-600" : "bg-gray-600"
                  } text-white hover:opacity-90`}
                >
                  <FaComment />
                  <span className="ml-2">Chat</span>
                </button>
              </div>
            )}

            {/* {isCallActive && (
              <div className="flex justify-center space-x-6 mb-6">
                <button
                  onClick={() => ratePartner(true)}
                  disabled={liked !== null}
                  className={`flex items-center px-6 py-3 rounded-xl transition shadow-md ${
                    liked === true
                      ? "bg-green-600"
                      : liked === false
                      ? "bg-gray-400"
                      : "bg-green-500 hover:bg-green-600"
                  } text-white`}
                >
                  <FaThumbsUp className="mr-2" />
                  <span>Like</span>
                </button>
                <button
                  onClick={() => ratePartner(false)}
                  disabled={liked !== null}
                  className={`flex items-center px-6 py-3 rounded-xl transition shadow-md ${
                    liked === false
                      ? "bg-red-600"
                      : liked === true
                      ? "bg-gray-400"
                      : "bg-red-500 hover:bg-red-600"
                  } text-white`}
                >
                  <FaThumbsDown className="mr-2" />
                  <span>Dislike</span>
                </button>
              </div>
            )} */}

            <div className="flex justify-center">
              {!localStreamReady && !isCallActive && !showInterestSelection ? (
                <button
                  onClick={startCall}
                  className="flex items-center px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition shadow-lg"
                >
                  <FaRandom className="mr-2" />
                  Start Sync
                </button>
              ) : (
                isCallActive && (
                  <button
                    onClick={endCall}
                    className="flex items-center px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition shadow-lg"
                  >
                    <FaPhoneSlash className="mr-2" />
                    End Call
                  </button>
                )
              )}
            </div>
          </div>

          {/* Chat sidebar - always visible but collapsible */}
          {showChat && (
            <div className="lg:w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="font-semibold text-gray-800">Chat</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-10">
                    {isCallActive
                      ? "Send a message to start chatting!"
                      : "Chat will appear here once connected"}
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${
                        msg.sender === "me" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-xs rounded-lg px-4 py-2 ${
                          msg.sender === "me"
                            ? "bg-blue-500 text-white"
                            : "bg-gray-200 text-gray-800"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-4 border-t border-gray-200">
                <div className="flex items-center">
                  <input
                    type="text"
                    ref={chatInputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 border border-gray-300 rounded-l-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!isCallActive}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!isCallActive}
                    className={`px-4 py-2 rounded-r-lg transition ${
                      isCallActive
                        ? "bg-blue-500 text-white hover:bg-blue-600"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    <IoSend />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default VideoChat;
