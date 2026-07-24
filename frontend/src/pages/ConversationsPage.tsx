import { useEffect, useRef, useState } from "react"
import {
  getConversations,
  getConversationMessages,
  markConversationRead,
} from "../services/conversations"

const RISK_COLOR: Record<string, string> = {
  low: "bg-green-500/10 text-green-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  high: "bg-red-500/10 text-red-400",
}

const RISK_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
}

const INTENT_LABEL: Record<string, string> = {
  promesa_pago: "Payment promise",
  pago_realizado: "Payment made",
  riesgo_alto: "High risk",
  saludo: "Greeting",
  general: "",
}

const INTENT_COLOR: Record<string, string> = {
  promesa_pago: "bg-yellow-500/20 text-yellow-300",
  pago_realizado: "bg-green-500/20 text-green-300",
  riesgo_alto: "bg-red-500/20 text-red-300",
  saludo: "bg-zinc-500/20 text-zinc-400",
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
    const interval = setInterval(loadConversations, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function loadConversations() {
    try {
      setLoading(true)
      const data = await getConversations()
      setConversations(data)
    } catch (error) {
      console.log(error)
    } finally {
      setLoading(false)
    }
  }

  async function selectConversation(conv: any) {
    setSelected(conv)
    try {
      const msgs = await getConversationMessages(conv._id)
      setMessages(msgs)

      if (conv.unreadCount > 0) {
        await markConversationRead(conv._id)
        setConversations((prev) =>
          prev.map((c) => (c._id === conv._id ? { ...c, unreadCount: 0 } : c))
        )
      }
    } catch (error) {
      console.log(error)
    }
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      active: "Active",
      awaiting_client: "Awaiting client",
      awaiting_agent: "Needs attention",
      closed: "Closed",
    }
    return map[status] || status
  }

  function getStatusDot(status: string) {
    if (status === "awaiting_agent") return "bg-yellow-400"
    if (status === "active") return "bg-green-400"
    if (status === "closed") return "bg-zinc-500"
    return "bg-blue-400"
  }

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)

  return (
    <div className="flex h-[calc(100vh-120px)] gap-0">

      {/* PANEL IZQUIERDO — Lista de conversaciones */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-zinc-800">

        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Conversations</h1>
            {totalUnread > 0 && (
              <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                {totalUnread}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 mt-1">
            {conversations.length} conversations
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && conversations.length === 0 && (
            <div className="p-6 text-zinc-400 text-sm">Loading...</div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="p-6 text-zinc-500 text-sm">
              No conversations yet. Send the first message.
            </div>
          )}

          {conversations.map((conv) => (
            <button
              key={conv._id}
              onClick={() => selectConversation(conv)}
              className={`
                w-full text-left p-4 border-b border-zinc-800/50
                hover:bg-zinc-800/50 transition-colors
                ${selected?._id === conv._id ? "bg-zinc-800" : ""}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${getStatusDot(conv.status)}`}
                  />
                  <p className="font-medium text-sm truncate">
                    {conv.clientId?.name || conv.phone}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 flex-shrink-0">
                    {conv.unreadCount}
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-500 mt-1 truncate ml-4">
                {conv.lastMessage || "No messages"}
              </p>

              <div className="flex items-center justify-between mt-1 ml-4">
                <span className="text-xs text-zinc-600">
                  {conv.lastMessageAt
                    ? new Date(conv.lastMessageAt).toLocaleString("en-US", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
                {conv.clientId?.risk && (
                  <span
                    className={`text-xs rounded px-1 ${
                      RISK_COLOR[conv.clientId.risk] || ""
                    }`}
                  >
                    {RISK_LABEL[conv.clientId.risk] || ""}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

      </div>

      {/* PANEL DERECHO — Mensajes */}
      <div className="flex-1 flex flex-col">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <p className="text-lg">Select a conversation</p>
            <p className="text-sm mt-1">to view the messages</p>
          </div>
        )}

        {selected && (
          <>
            {/* Header del chat */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">
                  {selected.clientId?.name || selected.phone}
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  {selected.phone}
                  {selected.clientId?.debt != null && (
                    <span className="ml-2">
                      · Debt: ${Number(selected.clientId.debt).toLocaleString("en-US")} MXN
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {selected.clientId?.risk && (
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      RISK_COLOR[selected.clientId.risk] || ""
                    }`}
                  >
                    Risk {RISK_LABEL[selected.clientId.risk]}
                  </span>
                )}
                <span className="text-xs text-zinc-400 bg-zinc-800 rounded-full px-3 py-1">
                  {getStatusLabel(selected.status)}
                </span>
              </div>
            </div>

            {/* Thread de mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-zinc-500 mt-8">No messages</div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`
                      max-w-sm lg:max-w-md xl:max-w-lg rounded-2xl p-4
                      ${
                        msg.direction === "outbound"
                          ? "bg-blue-600 text-white rounded-br-none"
                          : "bg-zinc-800 text-white rounded-bl-none"
                      }
                    `}
                  >
                    <p className="text-sm leading-relaxed">{msg.message}</p>

                    <div className="flex items-center justify-between mt-2 gap-3">
                      <span className="text-xs opacity-50">
                        {new Date(msg.createdAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>

                      <div className="flex items-center gap-2">
                        {msg.direction === "outbound" && (
                          <span
                            className={`text-xs ${
                              msg.status === "read"
                                ? "text-green-300"
                                : msg.status === "delivered"
                                  ? "text-blue-200"
                                  : "opacity-50"
                            }`}
                          >
                            {msg.status === "read"
                              ? "✓✓ Read"
                              : msg.status === "delivered"
                                ? "✓✓ Delivered"
                                : msg.status === "sent"
                                  ? "✓ Sent"
                                  : msg.status === "failed"
                                    ? "✗ Failed"
                                    : ""}
                          </span>
                        )}

                        {msg.direction === "inbound" &&
                          msg.intent &&
                          msg.intent !== "general" && (
                            <span
                              className={`text-xs rounded px-1.5 py-0.5 ${
                                INTENT_COLOR[msg.intent] || "bg-zinc-600/50 text-zinc-300"
                              }`}
                            >
                              {INTENT_LABEL[msg.intent] || msg.intent}
                            </span>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

    </div>
  )
}
