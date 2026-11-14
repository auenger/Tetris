/** Reconciles Claude partial events with the complete assistant messages sent afterwards. */
export class SupervisorTextStream {
  private seen = new Set<string>();
  private messages = new Map<string, Map<number, string>>();
  private current?: string;
  private published = '';

  accept(message: any): string | undefined {
    // Subagent output, reasoning, tool JSON and API error messages are not chat prose.
    if (message.parent_tool_use_id || message.error) return;
    if (message.type !== 'stream_event' && message.type !== 'assistant') return;
    if (typeof message.uuid === 'string') {
      if (this.seen.has(message.uuid)) return;
      this.seen.add(message.uuid);
    }
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event?.type === 'message_start') {
        this.current = event.message?.id;
        if (this.current && !this.messages.has(this.current)) this.messages.set(this.current, new Map());
      } else if (this.current) {
        const blocks = this.messages.get(this.current)!;
        if (event?.type === 'content_block_start' && event.content_block?.type === 'text') blocks.set(event.index, event.content_block.text || '');
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') blocks.set(event.index, (blocks.get(event.index) || '') + event.delta.text);
      }
    } else {
      const id = message.message?.id || this.current || message.uuid;
      if (!id) return;
      const blocks = new Map<number, string>();
      for (const [index, block] of (message.message?.content || []).entries()) if (block.type === 'text') blocks.set(index, block.text);
      this.messages.set(id, blocks);
    }
    const text = [...this.messages.values()].map(blocks => [...blocks.entries()].sort(([a], [b]) => a - b).map(([, text]) => text).join('')).filter(Boolean).join('\n\n');
    if (text === this.published) return;
    this.published = text; return text;
  }

  finish(result?: string): string {
    // The SDK's successful result is the authoritative final answer, not another delta.
    return result || this.published;
  }
}
