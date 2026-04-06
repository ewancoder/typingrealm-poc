/**
 * WebSocket wrapper for Rope War server communication.
 */

import type { ClientMessage, ServerMessage } from '../shared/protocol.js';

export class Connection {
    private ws: WebSocket | null = null;
    private onMessage: ((msg: ServerMessage) => void) | null = null;

    connect(address: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${address}:34500`);

            ws.addEventListener('open', () => {
                this.ws = ws;
                resolve();
            });

            ws.addEventListener('error', () => {
                reject(new Error('WebSocket connection failed'));
            });

            ws.addEventListener('close', () => {
                this.ws = null;
            });

            ws.addEventListener('message', (event) => {
                if (this.onMessage) {
                    const msg = JSON.parse(event.data as string) as ServerMessage;
                    this.onMessage(msg);
                }
            });
        });
    }

    send(msg: ClientMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    setMessageHandler(handler: (msg: ServerMessage) => void): void {
        this.onMessage = handler;
    }
}
