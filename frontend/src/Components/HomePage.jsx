import React, { useEffect, useRef, useState } from "react";
import "./HomePage.css";
import { useNavigate } from "react-router-dom";
import Profile from "./Profile/Profile";
import CreateGroup from "./Group/CreateGroup";
import { useDispatch, useSelector } from "react-redux";
import { currentUser, logoutAction, searchUser } from "../Redux/Auth/Action";
import { createChat, getUsersChat } from "../Redux/Chat/Action";
import { createMessage, getAllMessages } from "../Redux/Message/Action";
import SockJs from "sockjs-client/dist/sockjs";
import { Client } from "@stomp/stompjs";
import { BASE_API_URL } from "../config/api";
import ProfileSection from "./HomeComponents/ProfileSection";
import SearchBar from "./HomeComponents/SearchBar";
import ChatList from "./HomeComponents/ChatList";
import MessageCard from "./MessageCard/MessageCard";
import { AiOutlineSearch } from "react-icons/ai";
import { BsEmojiSmile, BsMicFill, BsThreeDotsVertical } from "react-icons/bs";
import { ImAttachment } from "react-icons/im";

function HomePage() {
  const [querys, setQuerys] = useState("");
  const [currentChat, setCurrentChat] = useState(null);
  const [content, setContent] = useState("");
  const [isProfile, setIsProfile] = useState(false);
  const navigate = useNavigate();
  const [isGroup, setIsGroup] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const dispatch = useDispatch();
  const { auth, chat, message } = useSelector((store) => store);
  const token = localStorage.getItem("token");
  const [stompClient, setStompClient] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [lastMessages, setLastMessages] = useState({});
  const messageContainerRef = useRef(null);
  const stompClientRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Function to establish a WebSocket connection
  const connect = () => {
    if (!token) return; // don't attempt without auth
    
    const client = new Client({
      webSocketFactory: () => new SockJs(`${BASE_API_URL}/ws`),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
        "X-XSRF-TOKEN": getCookie("XSRF-TOKEN"),
      },
      onConnect: onConnect,
      onStompError: onError,
      debug: (str) => {
        console.log('STOMP: ' + str);
      },
    });
    
    stompClientRef.current = client;
    setStompClient(client);
    client.activate();
  };

  // Function to get a specific cookie by name
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop().split(";").shift();
    }
  }

  // Callback for WebSocket connection error
  const onError = (error) => {
    console.log("on error ", error);
  };

  // Callback for successful WebSocket connection
  const onConnect = () => {
    setIsConnected(true);

    // Subscribe to the current chat messages based on the chat type
    if (stompClient && currentChat) {
      if (currentChat.group) {
        // Subscribe to group chat messages
        stompClient.subscribe(`/group/${currentChat?.id}`, onMessageReceive);
      } else {
        // Subscribe to direct (one-on-one) chat messages
        stompClient.subscribe(`/direct/${currentChat?.id}`, onMessageReceive);
      }
    }
  };

  // Callback to handle received messages from WebSocket
  const onMessageReceive = (payload) => {
    const receivedMessage = JSON.parse(payload.body);
    setMessages((prevMessages) => {
      // Avoid duplicating a message we already added optimistically when we sent it
      // (the server echoes it back over the same channel we're subscribed to)
      if (
        receivedMessage.id &&
        prevMessages.some((m) => m.id === receivedMessage.id)
      ) {
        return prevMessages;
      }
      return [...prevMessages, receivedMessage];
    });

    if (receivedMessage?.chat?.id) {
      setLastMessages((prev) => ({
        ...prev,
        [receivedMessage.chat.id]: receivedMessage,
      }));
    }
  };

  // Effect to establish a WebSocket connection
  useEffect(() => {
    connect();
    return () => {
      try {
        if (stompClientRef.current) {
          stompClientRef.current.deactivate();
          setIsConnected(false);
        }
      } catch (e) { }
    };
  }, []);

  // Effect to subscribe to a chat when connected
  useEffect(() => {
    if (isConnected && stompClient && currentChat?.id) {
      const subscription = currentChat.group
        ? stompClient.subscribe(`/group/${currentChat.id}`, onMessageReceive)
        : stompClient.subscribe(`/direct/${currentChat.id}`, onMessageReceive);

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [isConnected, stompClient, currentChat]);

  // Effect to reflect a message we just sent (via REST) in the open chat.
  // NOTE: we intentionally do NOT also stompClient.publish() here - the REST
  // call in handleCreateNewMessage already saves the message AND triggers the
  // backend's WebSocket broadcast (see MessageServiceImpl.sendMessage). Publishing
  // it again here used to cause every message to be broadcast twice.
  useEffect(() => {
    if (message.newMessage && currentChat?.id) {
      setMessages((prevMessages) => {
        if (prevMessages.some((m) => m.id === message.newMessage.id)) {
          return prevMessages;
        }
        return [...prevMessages, message.newMessage];
      });
    }
  }, [message.newMessage, currentChat]);

  // Effect to set the messages state from the store
  useEffect(() => {
    if (message.messages) {
      setMessages(message.messages);
    }
  }, [message.messages]);

  // Effect to get all messages when the current chat changes
  useEffect(() => {
    if (currentChat?.id) {
      dispatch(getAllMessages({ chatId: currentChat.id, token }));
    }
  }, [currentChat, message.newMessage]);

  // Effect to get user chats and groups
  useEffect(() => {
    dispatch(getUsersChat({ token }));
  }, [chat.createdChat, chat.createdGroup]);

  // Effect to immediately open a chat right after it's created (e.g. from a search result)
  useEffect(() => {
    if (chat.createdChat) {
      setCurrentChat(chat.createdChat);
    }
  }, [chat.createdChat]);

  // Function to handle opening the user menu
  const handleClick = (e) => {
    setAnchorEl(e.currentTarget);
  };

  // Function to handle closing the user menu
  const handleClose = () => {
    setAnchorEl(null);
  };

  // Function to handle clicking on a chat card
  const handleClickOnChatCard = (userId) => {
    dispatch(createChat({ token, data: { userId } }));
  };

  // Function to handle user search
  const handleSearch = (keyword) => {
    dispatch(searchUser({ keyword, token }));
  };

  // Function to create a new message
  const handleCreateNewMessage = () => {
    dispatch(
      createMessage({
        token,
        data: { chatId: currentChat.id, content: content },
      })
    );
    setContent(""); // Clear content after sending
  };

  // Effect to get the current user's information
  useEffect(() => {
    dispatch(currentUser(token));
  }, [token]);

  // Function to set the current chat
  const handleCurrentChat = (item) => {
    setCurrentChat(item);
  };

  // Effect to fetch each chat's latest message for the sidebar preview.
  // NOTE: this intentionally does NOT go through the shared `message.messages`
  // Redux slot (used for the currently open chat) - that slot is global/unkeyed,
  // so looping REST calls through it here previously caused a race condition
  // where a background chat's fetch could resolve last and silently overwrite
  // whatever conversation was actually open on screen.
  useEffect(() => {
    if (!chat?.chats || !Array.isArray(chat.chats) || !token) return;

    let cancelled = false;

    chat.chats.forEach(async (item) => {
      try {
        const res = await fetch(`${BASE_API_URL}/api/messages/${item.id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await res.json();
        if (cancelled || !Array.isArray(data) || data.length === 0) return;

        setLastMessages((prev) => ({
          ...prev,
          [item.id]: data[data.length - 1],
        }));
      } catch (e) {
        // ignore - sidebar preview is best-effort
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chat?.chats, token]);

  // Function to navigate to the user's profile
  const handleNavigate = () => {
    setIsProfile(true);
  };

  // Function to close the user's profile
  const handleCloseOpenProfile = () => {
    setIsProfile(false);
  };

  // Function to handle creating a new group
  const handleCreateGroup = () => {
    setIsGroup(true);
  };

  // Function to handle user logout
  const handleLogout = () => {
    try {
      if (stompClient && isConnected) {
        stompClient.deactivate();
        setIsConnected(false);
      }
    } catch (e) { }
    dispatch(logoutAction());
    navigate("/signin");
  };

  // Effect to check if the user is authenticated
  useEffect(() => {
    if (!auth.reqUser) {
      navigate("/signin");
    }
  }, [auth.reqUser]);
  return (

    <div className="relative">
      <div className="w-[100vw] py-14 bg-[#00a884]">
        <div className="flex bg-[#f0f2f5] h-[90vh] absolute top-[5vh] left-[2vw] w-[96vw]">
          <div className="left w-[30%] h-full bg-[#e8e9ec]">
            {isProfile && (
              <div className="w-full h-full">
                <Profile handleCloseOpenProfile={handleCloseOpenProfile} />
              </div>
            )}
            {isGroup && <CreateGroup setIsGroup={setIsGroup} />}
            {!isProfile && !isGroup && (
              <div className="w-full">
                <ProfileSection
                  auth={auth}
                  isProfile={isProfile}
                  isGroup={isGroup}
                  handleNavigate={handleNavigate}
                  handleClick={handleClick}
                  handleCreateGroup={handleCreateGroup}
                  handleLogout={handleLogout}
                  handleClose={handleClose}
                  open={open}
                  anchorEl={anchorEl}
                />
                <SearchBar
                  querys={querys}
                  setQuerys={setQuerys}
                  handleSearch={handleSearch}
                />
                <ChatList
                  querys={querys}
                  auth={auth}
                  chat={chat}
                  lastMessages={lastMessages}
                  handleClickOnChatCard={handleClickOnChatCard}
                  handleCurrentChat={handleCurrentChat}
                />
              </div>
            )}
          </div>
          {/* Default Chattingo Page */}
          {!currentChat?.id && (
            <div className="w-[70%] flex flex-col items-center justify-center h-full">
              <div className="max-w-[70%] text-center">
                <img
                  className="ml-11 lg:w-[75%] "
                  src="https://cdn.pixabay.com/photo/2015/08/03/13/58/whatsapp-873316_640.png"
                  alt="chattingo-icon"
                />
                <h1 className="text-4xl text-gray-600">Chattingo Web</h1>
                <p className="my-9">
                  Send and receive messages with Chattingo and save time.
                </p>
              </div>
            </div>
          )}

          {/* Message Section */}
          {currentChat?.id && (
            <div className="w-[70%] relative  bg-blue-200">
              <div className="header absolute top-0 w-full bg-[#f0f2f5]">
                <div className="flex justify-between">
                  <div className="py-3 space-x-4 flex items-center px-3">
                    <img
                      className="w-10 h-10 rounded-full"
                      src={
                        currentChat.group
                          ? currentChat.chat_image ||
                          "https://media.istockphoto.com/id/521977679/photo/silhouette-of-adult-woman.webp?b=1&s=170667a&w=0&k=20&c=wpJ0QJYXdbLx24H5LK08xSgiQ3zNkCAD2W3F74qlUL0="
                          : auth.reqUser?.id !== currentChat.users[0]?.id
                            ? currentChat.users[0]?.profile ||
                            "https://media.istockphoto.com/id/521977679/photo/silhouette-of-adult-woman.webp?b=1&s=170667a&w=0&k=20&c=wpJ0QJYXdbLx24H5LK08xSgiQ3zNkCAD2W3F74qlUL0="
                            : currentChat.users[1]?.profile ||
                            "https://media.istockphoto.com/id/521977679/photo/silhouette-of-adult-woman.webp?b=1&s=170667a&w=0&k=20&c=wpJ0QJYXdbLx24H5LK08xSgiQ3zNkCAD2W3F74qlUL0="
                      }
                      alt="profile"
                    />
                    <p>
                      {currentChat.group
                        ? currentChat.chatName
                        : auth.reqUser?.id !== currentChat.users[0]?.id
                          ? currentChat.users[0].name
                          : currentChat.users[1].name}
                    </p>
                  </div>
                  <div className="flex py-3 space-x-4 items-center px-3">
                    <AiOutlineSearch />
                    <BsThreeDotsVertical />
                  </div>
                </div>
              </div>

              {/* Message Section */}
              <div className="px-10 h-[85vh] overflow-y-scroll pb-10" ref={messageContainerRef}>
                <div className="space-y-1 w-full flex flex-col justify-center items-end  mt-20 py-2">
                  {messages?.length > 0 &&
                    messages?.map((item, i) => (
                      <MessageCard
                        key={i}
                        isReqUserMessage={item?.user?.id !== auth?.reqUser?.id}
                        content={item.content}
                        timestamp={item.timestamp}
                        profilePic={item?.user?.profile || "https://media.istockphoto.com/id/521977679/photo/silhouette-of-adult-woman.webp?b=1&s=170667a&w=0&k=20&c=wpJ0QJYXdbLx24H5LK08xSgiQ3zNkCAD2W3F74qlUL0="}
                      />
                    ))}
                </div>
              </div>

              {/* Footer Section */}
              <div className="footer bg-[#f0f2f5] absolute bottom-0 w-full py-3 text-2xl">
                <div className="flex justify-between items-center px-5 relative">
                  <BsEmojiSmile className="cursor-pointer" />
                  <ImAttachment />

                  <input
                    className="py-2 outline-none border-none bg-white pl-4 rounded-md w-[85%]"
                    type="text"
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Type message"
                    value={content}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        handleCreateNewMessage();
                        setContent("");
                      }
                    }}
                  />
                  <BsMicFill />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;

