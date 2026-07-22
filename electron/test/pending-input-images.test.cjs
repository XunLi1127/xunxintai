'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

let subject = {};
try { subject = require('../pending-input-images.cjs'); } catch (_) {}

const image = id => ({ type: 'image', id });
const messages = text => [{ role: 'user', content: [{ type: 'text', text }] }];

test('request keyed image injection and cleanup cannot cross or erase interleaved turns', () => {
    const store = subject.createPendingInputImages();
    store.ensure('A').push(image('A'));
    store.ensure('B').push(image('B'));
    const aPrompt = messages('a');
    const bPrompt = messages('b');
    subject.injectPendingInputImages({ store, requestId: 'A', messages: aPrompt });
    assert.deepEqual(aPrompt[0].content.map(part => part.id).filter(Boolean), ['A']);
    store.finish('A');
    assert.deepEqual(store.get('B'), [image('B')]);
    subject.injectPendingInputImages({ store, requestId: 'B', messages: bPrompt });
    assert.deepEqual(bPrompt[0].content.map(part => part.id).filter(Boolean), ['B']);
    store.finish('B');
    assert.deepEqual(store.get('A'), []);
    assert.deepEqual(store.get('B'), []);
});

test('retry does not duplicate an image already present', () => {
    const store = subject.createPendingInputImages();
    store.ensure('A').push(image('A'));
    const prompt = messages('a');
    subject.injectPendingInputImages({ store, requestId: 'A', messages: prompt });
    subject.injectPendingInputImages({ store, requestId: 'A', messages: prompt });
    assert.equal(prompt[0].content.filter(part => part.type === 'image').length, 1);
});
