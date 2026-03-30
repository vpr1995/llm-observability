#!/usr/bin/env node

const assert = require('assert');

(async () => {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const SESSION_ID = process.env.SESSION_ID || `session-correlation-${Date.now()}`;
  const CONVERSATION_ID = process.env.CONVERSATION_ID || `conversation-correlation-${Date.now()}`;
  const QUERY_TEXT = process.env.QUERY_TEXT || 'What is OpenTelemetry?';
  const FEEDBACK_RATING = Number(process.env.FEEDBACK_RATING || '5');
  const FEEDBACK_ACCURACY = process.env.FEEDBACK_ACCURACY ? process.env.FEEDBACK_ACCURACY === 'true' : true;
  const FEEDBACK_COMMENT = process.env.FEEDBACK_COMMENT || 'Helpful answer';

  console.log(`Testing session correlation against ${BASE_URL}`);
  console.log(`  Session ID:      ${SESSION_ID}`);
  console.log(`  Conversation ID: ${CONVERSATION_ID}`);
  console.log(`  Query:           ${QUERY_TEXT}`);
  console.log(`  Feedback rating: ${FEEDBACK_RATING}`);
  console.log(`  Feedback accuracy: ${FEEDBACK_ACCURACY}`);

  const queryResp = await fetch(`${BASE_URL}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': SESSION_ID,
      'X-Conversation-ID': CONVERSATION_ID,
    },
    body: JSON.stringify({ query: QUERY_TEXT }),
  });

  const queryBody = await queryResp.json().catch(() => ({}));

  try {
    assert.strictEqual(queryResp.status, 200, `/query did not return 200: ${queryResp.status}`);
    assert.ok(queryBody.requestId, '/query did not return requestId');
    assert.strictEqual(queryBody.sessionId, SESSION_ID, `/query body sessionId mismatch`);
    assert.strictEqual(queryBody.conversationId, CONVERSATION_ID, `/query body conversationId mismatch`);

    const responseSessionId = queryResp.headers.get('x-session-id');
    const responseConversationId = queryResp.headers.get('x-conversation-id');
    assert.strictEqual(responseSessionId, SESSION_ID, '/query header x-session-id mismatch');
    assert.strictEqual(responseConversationId, CONVERSATION_ID, '/query header x-conversation-id mismatch');

    const traceparent = queryBody.traceparent;
    if (!traceparent) {
      throw new Error('No traceparent returned from /query response');
    }

    console.log('Query response OK, continuing to /feedback.');

    const feedbackResp = await fetch(`${BASE_URL}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': SESSION_ID,
        'X-Conversation-ID': CONVERSATION_ID,
        ...(traceparent ? { 'X-Linked-To': traceparent } : {}),
      },
      body: JSON.stringify({
        requestId: queryBody.requestId,
        rating: FEEDBACK_RATING,
        accuracy: FEEDBACK_ACCURACY,
        comment: FEEDBACK_COMMENT,
      }),
    });

    const feedbackBody = await feedbackResp.json().catch(() => ({}));
    assert.strictEqual(feedbackResp.status, 202, `/feedback did not return 202: ${feedbackResp.status}`);
    assert.strictEqual(feedbackBody.accepted, true, '/feedback accepted not true');
    assert.strictEqual(feedbackBody.requestId, queryBody.requestId, '/feedback requestId mismatch');

    const fSessionId = feedbackResp.headers.get('x-session-id');
    const fConversationId = feedbackResp.headers.get('x-conversation-id');
    assert.strictEqual(fSessionId, SESSION_ID, '/feedback header x-session-id mismatch');
    assert.strictEqual(fConversationId, CONVERSATION_ID, '/feedback header x-conversation-id mismatch');

    // Verify trace ID separation: query and feedback must have DIFFERENT trace IDs
    const queryTraceId = queryBody.traceId;
    const feedbackTraceId = feedbackBody.traceId;
    const linkedTraceId = feedbackBody.linkedTraceId;

    console.log(`Query traceId:           ${queryTraceId}`);
    console.log(`Feedback traceId:        ${feedbackTraceId}`);
    console.log(`Feedback linkedTraceId:  ${linkedTraceId}`);

    assert.ok(queryTraceId, 'Query response must include traceId');
    assert.ok(feedbackTraceId, 'Feedback response must include traceId');
    assert.notStrictEqual(
      feedbackTraceId,
      queryTraceId,
      'Feedback must have its own traceId, different from the query traceId',
    );

    // Verify the link: feedback's linkedTraceId should point back to the query's traceId
    assert.strictEqual(
      linkedTraceId,
      queryTraceId,
      'Feedback linkedTraceId must match the query traceId for proper span linking',
    );

    console.log('Trace ID separation & linking verified.');
    console.log('Feedback correlation test passed.');
    console.log(`requestId: ${queryBody.requestId}`);
    console.log(`feedbackId: ${feedbackBody.feedbackId}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
})();
