/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { ConfigurationEntry } from '../../../codewhisperer/models/model'
import {
    DocumentChangedSource,
    KeyStrokeHandler,
    DefaultDocumentChangedType,
} from '../../../codewhisperer/service/keyStrokeHandler'
import { createMockTextEditor, createTextDocumentChangeEvent, resetCodeWhispererGlobalVariables } from '../testUtil'
import { InlineCompletionService } from '../../../codewhisperer/service/inlineCompletionService'
import * as EditorContext from '../../../codewhisperer/util/editorContext'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { isInlineCompletionEnabled } from '../../../codewhisperer/util/commonUtil'
import { ClassifierTrigger } from '../../../codewhisperer/service/classifierTrigger'
import { CodeWhispererUserGroupSettings } from '../../../codewhisperer/util/userGroupUtil'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'

const performance = globalThis.performance ?? require('perf_hooks').performance

describe('keyStrokeHandler', function () {
    const config: ConfigurationEntry = {
        isShowMethodsEnabled: true,
        isManualTriggerEnabled: true,
        isAutomatedTriggerEnabled: true,
        isSuggestionsWithCodeReferencesEnabled: true,
    }
    beforeEach(function () {
        resetCodeWhispererGlobalVariables()
    })
    describe('processKeyStroke', async function () {
        let invokeSpy: sinon.SinonStub
        let startTimerSpy: sinon.SinonStub
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            invokeSpy = sinon.stub(KeyStrokeHandler.instance, 'invokeAutomatedTrigger')
            startTimerSpy = sinon.stub(KeyStrokeHandler.instance, 'startIdleTimeTriggerTimer')
            sinon.spy(RecommendationHandler.instance, 'getRecommendations')
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
            sinon.stub(mockClient, 'listRecommendations')
            sinon.stub(mockClient, 'generateRecommendations')
        })
        afterEach(function () {
            sinon.restore()
            CodeWhispererUserGroupSettings.instance.reset()
        })

        it('Whatever the input is, should skip when automatic trigger is turned off, should not call invokeAutomatedTrigger', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            const cfg: ConfigurationEntry = {
                isShowMethodsEnabled: true,
                isManualTriggerEnabled: true,
                isAutomatedTriggerEnabled: false,
                isSuggestionsWithCodeReferencesEnabled: true,
            }
            const keyStrokeHandler = new KeyStrokeHandler()
            await keyStrokeHandler.processKeyStroke(mockEvent, mockEditor, mockClient, cfg)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when changed text across multiple lines', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
                '\nprint(n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should not call invokeAutomatedTrigger when doing delete or undo (empty changed text)', async function () {
            const mockEditor = createMockTextEditor()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ''
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
            assert.ok(!startTimerSpy.called)
        })

        it('Should call invokeAutomatedTrigger if previous text input is within 2 seconds but the new input is new line', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger if previous text input is within 2 seconds but the new input is a specialcharacter', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '('
            )
            RecommendationHandler.instance.lastInvocationTime = performance.now() - 1500
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \n', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('Enter', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with Enter when inputing \r\n', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 2)),
                '\r\n'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('Enter', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with SpecialCharacter when inputing {', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '{'
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('SpecialCharacters', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger with SpecialCharacter when inputing spaces equivalent to \t', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '  '
            )
            EditorContext.updateTabSize(2)
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            invokeSpy('SpecialCharacters', mockEditor, mockClient)
            assert.ok(invokeSpy.called)
        })

        it('Should not call invokeAutomatedTrigger with SpecialCharacter when inputing spaces not equivalent to \t', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '   '
            )
            EditorContext.updateTabSize(2)
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should not start idle trigger timer when inputing special characters', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '('
            )
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!startTimerSpy.called)
        })

        it('Should not call invokeAutomatedTrigger for non-special characters for classifier language if classifier says no', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            sinon.stub(ClassifierTrigger.instance, 'shouldTriggerFromClassifier').returns(false)
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(!invokeSpy.called)
        })

        it('Should call invokeAutomatedTrigger for non-special characters for classifier language if classifier says yes', async function () {
            const mockEditor = createMockTextEditor('function addTwo', 'test.js', 'javascript')
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                'a'
            )
            sinon.stub(ClassifierTrigger.instance, 'shouldTriggerFromClassifier').returns(true)
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.ok(invokeSpy.called)
        })

        it('Should skip invoking if there is immediate right context on the same line and not a single } for the user group', async function () {
            const casesForSuppressTokenFilling = [
                {
                    rightContext: 'add',
                    shouldInvoke: false,
                },
                {
                    rightContext: '}',
                    shouldInvoke: true,
                },
                {
                    rightContext: '}    ',
                    shouldInvoke: true,
                },
                {
                    rightContext: ' add',
                    shouldInvoke: true,
                },
                {
                    rightContext: '    ',
                    shouldInvoke: true,
                },
                {
                    rightContext: '\naddTwo',
                    shouldInvoke: true,
                },
            ]
            casesForSuppressTokenFilling.forEach(async ({ rightContext, shouldInvoke }) => {
                await testIfRightContextShouldInvoke(
                    rightContext,
                    shouldInvoke,
                    CodeWhispererConstants.UserGroup.RightContext
                )
            })
        })

        it('Should not skip invoking based on right context for control group', async function () {
            await testIfRightContextShouldInvoke('add', true, CodeWhispererConstants.UserGroup.Control)
        })

        async function testIfRightContextShouldInvoke(
            rightContext: string,
            shouldTrigger: boolean,
            userGroup: CodeWhispererConstants.UserGroup
        ) {
            const mockEditor = createMockTextEditor(rightContext, 'test.js', 'javascript', 1, 1)
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '{'
            )
            CodeWhispererUserGroupSettings.instance.userGroup = userGroup
            await KeyStrokeHandler.instance.processKeyStroke(mockEvent, mockEditor, mockClient, config)
            assert.strictEqual(invokeSpy.called, shouldTrigger)
        }
    })

    describe('invokeAutomatedTrigger', function () {
        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient
        beforeEach(function () {
            sinon.restore()
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            resetCodeWhispererGlobalVariables()
            sinon.stub(mockClient, 'listRecommendations')
            sinon.stub(mockClient, 'generateRecommendations')
        })
        afterEach(function () {
            sinon.restore()
        })

        it('should call getPaginatedRecommendation when inline completion is enabled', async function () {
            const mockEditor = createMockTextEditor()
            const keyStrokeHandler = new KeyStrokeHandler()
            const mockEvent: vscode.TextDocumentChangeEvent = createTextDocumentChangeEvent(
                mockEditor.document,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                ' '
            )
            const getRecommendationsStub = sinon.stub(InlineCompletionService.instance, 'getPaginatedRecommendation')
            await keyStrokeHandler.invokeAutomatedTrigger('Enter', mockEditor, mockClient, config, mockEvent)
            assert.strictEqual(getRecommendationsStub.called, isInlineCompletionEnabled())
        })
    })

    describe('shouldTriggerIdleTime', function () {
        it('should return false when inline is enabled and inline completion is in progress ', function () {
            const keyStrokeHandler = new KeyStrokeHandler()
            sinon.stub(InlineCompletionService.instance, 'isPaginationRunning').returns(true)
            const result = keyStrokeHandler.shouldTriggerIdleTime()
            assert.strictEqual(result, !isInlineCompletionEnabled())
        })
    })

    describe('test checkChangeSource', function () {
        const tabStr = ' '.repeat(EditorContext.getTabSize())

        const cases: [string, DocumentChangedSource][] = [
            ['\n          ', DocumentChangedSource.EnterKey],
            ['\n', DocumentChangedSource.EnterKey],
            ['(', DocumentChangedSource.SpecialCharsKey],
            ['()', DocumentChangedSource.SpecialCharsKey],
            ['{}', DocumentChangedSource.SpecialCharsKey],
            ['(a, b):', DocumentChangedSource.Unknown],
            [':', DocumentChangedSource.SpecialCharsKey],
            ['a', DocumentChangedSource.RegularKey],
            [tabStr, DocumentChangedSource.TabKey],
            ['   ', DocumentChangedSource.Reformatting],
            ['def add(a,b):\n    return a + b\n', DocumentChangedSource.Unknown],
            ['function suggestedByIntelliSense():', DocumentChangedSource.Unknown],
        ]

        cases.forEach(tuple => {
            const input = tuple[0]
            const expected = tuple[1]
            it(`test input ${input} should return ${expected}`, function () {
                const actual = new DefaultDocumentChangedType(
                    createFakeDocumentChangeEvent(tuple[0])
                ).checkChangeSource()
                assert.strictEqual(actual, expected)
            })
        })

        function createFakeDocumentChangeEvent(str: string): ReadonlyArray<vscode.TextDocumentContentChangeEvent> {
            return [
                {
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
                    rangeOffset: 0,
                    rangeLength: 0,
                    text: str,
                },
            ]
        }
    })
})
