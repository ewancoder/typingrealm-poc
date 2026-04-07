package main

import (
	"encoding/json"
	"fmt"

	"github.com/gorilla/websocket"
)

type connection struct {
	ws    *websocket.Conn
	msgCh chan serverMsg
}

func dial(address string) (*connection, error) {
	url := fmt.Sprintf("ws://%s:34500", address)
	ws, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, err
	}
	c := &connection{
		ws:    ws,
		msgCh: make(chan serverMsg, 64),
	}
	go c.readLoop()
	return c, nil
}

func (c *connection) readLoop() {
	defer close(c.msgCh)
	for {
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			return
		}
		var msg serverMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}
		c.msgCh <- msg
	}
}

func (c *connection) send(msg map[string]any) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	_ = c.ws.WriteMessage(websocket.TextMessage, data)
}

func (c *connection) close() {
	_ = c.ws.Close()
}
