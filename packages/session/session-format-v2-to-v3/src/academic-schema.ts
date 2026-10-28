/** Fixed T0 payload schemas plus the separately declared released master Trace v1 schema. */

import type { JSONSchema } from 'zod/v4/core'
import { academicTraceV1Schema } from './academic-trace-schema.ts'

/** Audited historical payload schemas; current plugin declarations never extend this data. */
export const academicV2Schema: {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, JSONSchema.JSONSchema>>
  readonly $defs: Record<string, JSONSchema.JSONSchema>
} = {
  'type': 'object',
  'properties': {
    'academic/evidence-request': {
      '$ref': '#/$defs/value0',
    },
    'academic/evidence-result': {
      '$ref': '#/$defs/value38',
    },
    'academic/evidence-fragment-verified': {
      '$ref': '#/$defs/value69',
    },
    'academic/synthesis-request': {
      '$ref': '#/$defs/value127',
    },
    'academic/synthesis-result': {
      '$ref': '#/$defs/value172',
    },
    'academic/search-plan': {
      '$ref': '#/$defs/value176',
    },
    'academic/candidate-batch-decision': {
      '$ref': '#/$defs/value180',
    },
    'academic/candidate-batch-settlement': {
      '$ref': '#/$defs/value182',
    },
    'academic/run-settlement': {
      '$ref': '#/$defs/value189',
    },
    'academic/recovery-checkpoint': {
      '$ref': '#/$defs/value191',
    },
    'academic/evidence-enhancement-selection': {
      '$ref': '#/$defs/value282',
    },
    'academic/evidence-enhancement-settlement': {
      '$ref': '#/$defs/value283',
    },
    'academic/candidate-screening-request': {
      '$ref': '#/$defs/value285',
    },
    'academic/candidate-screening-result': {
      '$ref': '#/$defs/value286',
    },
    'academic/candidate-review-selection-v1': {
      '$ref': '#/$defs/value287',
    },
    'academic/candidate-semantic-review-request-v1': {
      '$ref': '#/$defs/value293',
    },
    'academic/candidate-semantic-review-result-v1': {
      '$ref': '#/$defs/value294',
    },
    'academic/candidate-semantic-review-verified-v1': {
      '$ref': '#/$defs/value295',
    },
    'academic/background-run-state': {
      '$ref': '#/$defs/value303',
    },
    'academic/trace-v1': academicTraceV1Schema,
  },
  '$defs': {
    'value0': {
      'type': 'object',
      'properties': {
        'source': {
          '$ref': '#/$defs/value1',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'config': {
          '$ref': '#/$defs/value7',
        },
        'messages': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string',
                'minLength': 1,
              },
              'role': {
                'const': 'user',
              },
              'source': {
                'type': 'object',
                'properties': {
                  'kind': {
                    'const': 'plugin',
                  },
                  'plugin': {
                    'const': 'dsh-academic-workflow',
                  },
                },
                'required': [
                  'kind',
                  'plugin',
                ],
                'additionalProperties': false,
              },
              'content': {
                'type': 'array',
                'items': {
                  'type': 'object',
                  'properties': {
                    'type': {
                      'const': 'text',
                    },
                    'text': {
                      'type': 'string',
                    },
                  },
                  'required': [
                    'type',
                    'text',
                  ],
                  'additionalProperties': false,
                },
              },
            },
            'required': [
              'id',
              'role',
              'source',
              'content',
            ],
            'additionalProperties': false,
          },
        },
        'estimatedInputTokens': {
          'type': 'number',
        },
        'contextWindow': {
          'type': 'number',
        },
        'outputTokens': {
          'type': 'number',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'decision': {
          '$ref': '#/$defs/value37',
        },
      },
      'required': [
        'source',
        'config',
        'messages',
        'estimatedInputTokens',
        'contextWindow',
        'outputTokens',
        'attempt',
        'maxAttempts',
        'decision',
      ],
      'additionalProperties': false,
    },
    'value1': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          'type': 'string',
        },
        'sourceProvider': {
          'type': 'string',
        },
        'sourceUrl': {
          'type': 'string',
        },
        'retrievedAt': {
          'type': 'string',
        },
        'extractionMethod': {
          '$ref': '#/$defs/value2',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'contentHash',
        'sourceProvider',
        'sourceUrl',
        'retrievedAt',
        'extractionMethod',
      ],
      'additionalProperties': false,
    },
    'value2': {
      'type': 'object',
      'properties': {
        'method': {
          'type': 'string',
        },
        'methodVersion': {
          'type': 'string',
        },
      },
      'required': [
        'method',
        'methodVersion',
      ],
      'additionalProperties': false,
    },
    'value3': {
      'anyOf': [
        {
          'const': 'scope',
        },
        {
          'const': 'evidence',
        },
      ],
    },
    'value4': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'stage': {
          'const': 'extraction',
        },
        'attempt': {
          'type': 'number',
        },
        'maximumAttempts': {
          'type': 'number',
        },
        'maximumOutputTokens': {
          'type': 'number',
        },
        'fragmentIndex': {
          'type': 'number',
        },
        'sourceRanges': {
          '$ref': '#/$defs/value5',
        },
        'segmentIndex': {
          'type': 'number',
        },
        'characterStart': {
          'type': 'number',
        },
        'characterEnd': {
          'type': 'number',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'stage',
        'attempt',
        'maximumAttempts',
        'maximumOutputTokens',
        'fragmentIndex',
        'segmentIndex',
        'characterStart',
        'characterEnd',
      ],
      'additionalProperties': false,
    },
    'value5': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value6',
      },
    },
    'value6': {
      'type': 'object',
      'properties': {
        'segmentIndex': {
          'type': 'number',
        },
        'characterStart': {
          'type': 'number',
        },
        'characterEnd': {
          'type': 'number',
        },
      },
      'required': [
        'segmentIndex',
        'characterStart',
        'characterEnd',
      ],
      'additionalProperties': false,
    },
    'value7': {
      'type': 'object',
      'properties': {
        'provider': {
          'type': 'string',
        },
        'model': {
          'type': 'string',
        },
        'reasoningEffort': {
          'type': 'string',
          'minLength': 1,
        },
        'temperature': {
          'type': 'number',
        },
        'maxTokens': {
          'type': 'number',
        },
        'stop': {
          '$ref': '#/$defs/value8',
        },
      },
      'required': [
        'provider',
        'model',
      ],
      'additionalProperties': false,
    },
    'value8': {
      'type': 'array',
      'items': {
        'type': 'string',
      },
    },
    'value12': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value13',
      },
    },
    'value13': {
      'anyOf': [
        {
          '$ref': '#/$defs/value14',
        },
        {
          '$ref': '#/$defs/value15',
        },
        {
          '$ref': '#/$defs/value16',
        },
        {
          '$ref': '#/$defs/value20',
        },
        {
          '$ref': '#/$defs/value22',
        },
        {
          '$ref': '#/$defs/value23',
        },
      ],
    },
    'value14': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'text',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'text',
      ],
      'additionalProperties': false,
    },
    'value15': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'reasoning',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'text',
      ],
      'additionalProperties': false,
    },
    'value16': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'image',
        },
        'attachment': {
          '$ref': '#/$defs/value17',
        },
      },
      'required': [
        'type',
        'attachment',
      ],
      'additionalProperties': false,
    },
    'value17': {
      'type': 'object',
      'properties': {
        'attachmentId': {
          'type': 'string',
          'minLength': 1,
        },
        'mediaType': {
          '$ref': '#/$defs/value18',
        },
        'bytes': {
          'type': 'number',
        },
        'width': {
          'type': 'number',
        },
        'height': {
          'type': 'number',
        },
        'name': {
          'type': 'string',
        },
        'originalDimensions': {
          '$ref': '#/$defs/value19',
        },
      },
      'required': [
        'attachmentId',
        'mediaType',
        'bytes',
        'width',
        'height',
      ],
      'additionalProperties': false,
    },
    'value18': {
      'anyOf': [
        {
          'const': 'image/png',
        },
        {
          'const': 'image/jpeg',
        },
        {
          'const': 'image/webp',
        },
        {
          'const': 'image/gif',
        },
      ],
    },
    'value19': {
      'type': 'object',
      'properties': {
        'width': {
          'type': 'number',
        },
        'height': {
          'type': 'number',
        },
      },
      'required': [
        'width',
        'height',
      ],
      'additionalProperties': false,
    },
    'value20': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'file',
        },
        'attachment': {
          '$ref': '#/$defs/value21',
        },
      },
      'required': [
        'type',
        'attachment',
      ],
      'additionalProperties': false,
    },
    'value21': {
      'type': 'object',
      'properties': {
        'attachmentId': {
          'type': 'string',
          'minLength': 1,
        },
        'name': {
          'type': 'string',
        },
        'bytes': {
          'type': 'number',
        },
      },
      'required': [
        'attachmentId',
        'name',
        'bytes',
      ],
      'additionalProperties': false,
    },
    'value22': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'tool-call',
        },
        'id': {
          'type': 'string',
          'minLength': 1,
        },
        'name': {
          'type': 'string',
        },
        'arguments': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'id',
        'name',
        'arguments',
      ],
      'additionalProperties': false,
    },
    'value23': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'tool-result',
        },
        'toolCallId': {
          'type': 'string',
          'minLength': 1,
        },
        'content': {
          '$ref': '#/$defs/value12',
        },
        'isError': {
          'type': 'boolean',
        },
      },
      'required': [
        'type',
        'toolCallId',
        'content',
      ],
      'additionalProperties': false,
    },
    'value37': {
      'anyOf': [
        {
          'const': 'dispatch',
        },
        {
          'const': 'skip_input_limit',
        },
      ],
    },
    'value38': {
      'type': 'object',
      'properties': {
        'source': {
          '$ref': '#/$defs/value1',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'requestSeq': {
          '$ref': '#/$defs/value39',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'status': {
          '$ref': '#/$defs/value40',
        },
        'elapsedMs': {
          'type': 'number',
        },
        'firstContentElapsedMs': {
          'type': 'number',
        },
        'failurePhase': {
          '$ref': '#/$defs/value41',
        },
        'stream': {
          '$ref': '#/$defs/value42',
        },
        'finish': {
          '$ref': '#/$defs/value60',
        },
        'usage': {
          '$ref': '#/$defs/value58',
        },
        'errorCode': {
          'type': 'string',
        },
      },
      'required': [
        'source',
        'requestSeq',
        'attempt',
        'maxAttempts',
        'status',
        'stream',
      ],
      'additionalProperties': false,
    },
    'value39': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'integer',
          'minimum': 0,
        },
      ],
    },
    'value40': {
      'anyOf': [
        {
          'const': 'validated',
        },
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'skipped',
        },
      ],
    },
    'value41': {
      'anyOf': [
        {
          'const': 'prepare',
        },
        {
          'const': 'admission',
        },
        {
          'const': 'before_content',
        },
        {
          'const': 'after_content',
        },
        {
          'const': 'parse',
        },
      ],
    },
    'value42': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value43',
      },
    },
    'value43': {
      'anyOf': [
        {
          '$ref': '#/$defs/value44',
        },
        {
          '$ref': '#/$defs/value47',
        },
        {
          '$ref': '#/$defs/value48',
        },
        {
          '$ref': '#/$defs/value49',
        },
      ],
    },
    'value44': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'text-chunks',
        },
        'time0': {
          'type': 'number',
        },
        'index': {
          'type': 'number',
        },
        'dt': {
          '$ref': '#/$defs/value45',
        },
        'texts': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'type',
        'time0',
        'index',
        'dt',
        'texts',
      ],
      'additionalProperties': false,
    },
    'value45': {
      'type': 'array',
      'items': {
        'type': 'number',
      },
    },
    'value46': {
      'type': 'array',
      'items': {
        'type': 'string',
      },
    },
    'value47': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'reasoning-chunks',
        },
        'time0': {
          'type': 'number',
        },
        'index': {
          'type': 'number',
        },
        'dt': {
          '$ref': '#/$defs/value45',
        },
        'texts': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'type',
        'time0',
        'index',
        'dt',
        'texts',
      ],
      'additionalProperties': false,
    },
    'value48': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'tool-call-chunks',
        },
        'time0': {
          'type': 'number',
        },
        'index': {
          'type': 'number',
        },
        'dt': {
          '$ref': '#/$defs/value45',
        },
        'id': {
          'type': 'string',
          'minLength': 1,
        },
        'name': {
          'type': 'string',
        },
        'args': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'type',
        'time0',
        'index',
        'dt',
        'id',
        'args',
      ],
      'additionalProperties': false,
    },
    'value49': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'chunk',
        },
        'time': {
          'type': 'number',
        },
        'chunk': {
          '$ref': '#/$defs/value50',
        },
      },
      'required': [
        'type',
        'time',
        'chunk',
      ],
      'additionalProperties': false,
    },
    'value50': {
      'anyOf': [
        {
          '$ref': '#/$defs/value51',
        },
        {
          '$ref': '#/$defs/value53',
        },
        {
          '$ref': '#/$defs/value54',
        },
        {
          '$ref': '#/$defs/value55',
        },
        {
          '$ref': '#/$defs/value56',
        },
        {
          '$ref': '#/$defs/value57',
        },
        {
          '$ref': '#/$defs/value59',
        },
      ],
    },
    'value51': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'block-start',
        },
        'index': {
          'type': 'number',
        },
        'blockType': {
          '$ref': '#/$defs/value52',
        },
      },
      'required': [
        'type',
        'index',
        'blockType',
      ],
      'additionalProperties': false,
    },
    'value52': {
      'anyOf': [
        {
          'const': 'text',
        },
        {
          'const': 'reasoning',
        },
        {
          'const': 'image',
        },
        {
          'const': 'file',
        },
        {
          'const': 'tool-call',
        },
        {
          'const': 'tool-result',
        },
      ],
    },
    'value53': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'text-delta',
        },
        'index': {
          'type': 'number',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'index',
        'text',
      ],
      'additionalProperties': false,
    },
    'value54': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'reasoning-delta',
        },
        'index': {
          'type': 'number',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'index',
        'text',
      ],
      'additionalProperties': false,
    },
    'value55': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'tool-call-delta',
        },
        'index': {
          'type': 'number',
        },
        'id': {
          'type': 'string',
          'minLength': 1,
        },
        'name': {
          'type': 'string',
        },
        'argumentsDelta': {
          'type': 'string',
        },
      },
      'required': [
        'type',
        'index',
        'id',
        'argumentsDelta',
      ],
      'additionalProperties': false,
    },
    'value56': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'block-end',
        },
        'index': {
          'type': 'number',
        },
        'block': {
          '$ref': '#/$defs/value13',
        },
      },
      'required': [
        'type',
        'index',
        'block',
      ],
      'additionalProperties': false,
    },
    'value57': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'usage',
        },
        'usage': {
          '$ref': '#/$defs/value58',
        },
      },
      'required': [
        'type',
        'usage',
      ],
      'additionalProperties': false,
    },
    'value58': {
      'type': 'object',
      'properties': {
        'inputTokens': {
          'type': 'number',
        },
        'outputTokens': {
          'type': 'number',
        },
        'totalTokens': {
          'type': 'number',
        },
        'cacheReadTokens': {
          'type': 'number',
        },
        'cacheWriteTokens': {
          'type': 'number',
        },
        'reasoningTokens': {
          'type': 'number',
        },
      },
      'required': [
        'inputTokens',
        'outputTokens',
      ],
      'additionalProperties': false,
    },
    'value59': {
      'type': 'object',
      'properties': {
        'type': {
          'const': 'finish',
        },
        'reason': {
          '$ref': '#/$defs/value60',
        },
        'replayState': {
          '$ref': '#/$defs/value67',
        },
      },
      'required': [
        'type',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value60': {
      'anyOf': [
        {
          '$ref': '#/$defs/value61',
        },
        {
          '$ref': '#/$defs/value62',
        },
        {
          '$ref': '#/$defs/value63',
        },
        {
          '$ref': '#/$defs/value64',
        },
        {
          '$ref': '#/$defs/value66',
        },
      ],
    },
    'value61': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'stop',
        },
      },
      'required': [
        'kind',
      ],
      'additionalProperties': false,
    },
    'value62': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'tool-calls',
        },
      },
      'required': [
        'kind',
      ],
      'additionalProperties': false,
    },
    'value63': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'max-tokens',
        },
      },
      'required': [
        'kind',
      ],
      'additionalProperties': false,
    },
    'value64': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'aborted',
        },
        'failure': {
          '$ref': '#/$defs/value65',
        },
      },
      'required': [
        'kind',
        'failure',
      ],
      'additionalProperties': false,
    },
    'value65': {
      'type': 'object',
      'properties': {
        'message': {
          'type': 'string',
        },
        'code': {
          'type': 'string',
        },
        'status': {
          'type': 'number',
        },
        'providerRetryAfterMs': {
          'type': 'number',
        },
        'requestId': {
          'type': 'string',
          'minLength': 1,
        },
      },
      'required': [
        'message',
        'code',
      ],
      'additionalProperties': false,
    },
    'value66': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'error',
        },
        'failure': {
          '$ref': '#/$defs/value65',
        },
      },
      'required': [
        'kind',
        'failure',
      ],
      'additionalProperties': false,
    },
    'value67': {
      'type': 'object',
      'properties': {
        'response': {},
        'blocks': {},
      },
      'required': [
        'response',
      ],
      'additionalProperties': false,
    },
    'value68': {
      'type': 'array',
      'items': {},
    },
    'value69': {
      'type': 'object',
      'properties': {
        'source': {
          '$ref': '#/$defs/value1',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'evidence': {
          '$ref': '#/$defs/value70',
        },
        'purpose': {
          'const': 'enhancement',
        },
      },
      'required': [
        'source',
        'fragment',
        'evidence',
      ],
      'additionalProperties': false,
    },
    'value70': {
      'type': 'object',
      'properties': {
        'sourceLocators': {
          '$ref': '#/$defs/value71',
        },
        'evidenceRecords': {
          '$ref': '#/$defs/value81',
        },
        'questionLinks': {
          '$ref': '#/$defs/value90',
        },
        'evidenceCard': {
          '$ref': '#/$defs/value92',
        },
        'rejectedDrafts': {
          '$ref': '#/$defs/value124',
        },
      },
      'required': [
        'sourceLocators',
        'evidenceRecords',
        'questionLinks',
        'evidenceCard',
        'rejectedDrafts',
      ],
      'additionalProperties': false,
    },
    'value71': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value72',
      },
    },
    'value72': {
      'anyOf': [
        {
          '$ref': '#/$defs/value73',
        },
        {
          '$ref': '#/$defs/value75',
        },
        {
          '$ref': '#/$defs/value76',
        },
        {
          '$ref': '#/$defs/value77',
        },
        {
          '$ref': '#/$defs/value78',
        },
        {
          '$ref': '#/$defs/value80',
        },
      ],
    },
    'value73': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'provider_record',
        },
        'provider': {
          'type': 'string',
        },
        'recordId': {
          'type': 'string',
        },
        'url': {
          'type': 'string',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'provider',
        'recordId',
        'url',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value74': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'string',
        },
      ],
    },
    'value75': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'abstract',
        },
        'characterStart': {
          'type': 'number',
        },
        'characterEnd': {
          'type': 'number',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'characterStart',
        'characterEnd',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value76': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'page_section',
        },
        'sectionTitle': {
          'type': 'string',
        },
        'pdfPage': {
          'type': 'number',
        },
        'printedPage': {
          '$ref': '#/$defs/value74',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'sectionTitle',
        'pdfPage',
        'printedPage',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value77': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'paragraph',
        },
        'sectionTitle': {
          '$ref': '#/$defs/value74',
        },
        'paragraphNumber': {
          'type': 'number',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'sectionTitle',
        'paragraphNumber',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value78': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'table',
        },
        'tableNumber': {
          'type': 'string',
        },
        'title': {
          '$ref': '#/$defs/value74',
        },
        'pdfPage': {
          '$ref': '#/$defs/value79',
        },
        'printedPage': {
          '$ref': '#/$defs/value74',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'tableNumber',
        'title',
        'pdfPage',
        'printedPage',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value79': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'number',
        },
      ],
    },
    'value80': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'figure',
        },
        'figureNumber': {
          'type': 'string',
        },
        'title': {
          '$ref': '#/$defs/value74',
        },
        'pdfPage': {
          '$ref': '#/$defs/value79',
        },
        'printedPage': {
          '$ref': '#/$defs/value74',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'figureNumber',
        'title',
        'pdfPage',
        'printedPage',
        'sourceLocatorId',
        'schemaVersion',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value81': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value82',
      },
    },
    'value82': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'evidenceId': {
          'type': 'string',
          'minLength': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'level': {
          '$ref': '#/$defs/value83',
        },
        'verbatimExcerpt': {
          '$ref': '#/$defs/value84',
        },
        'sourcedStatement': {
          'type': 'string',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'sourceProvider': {
          'type': 'string',
        },
        'sourceUrl': {
          'type': 'string',
        },
        'retrievedAt': {
          'type': 'string',
        },
        'contentHash': {
          '$ref': '#/$defs/value84',
        },
        'extractionMethod': {
          '$ref': '#/$defs/value2',
        },
        'qualityNotes': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'evidenceId',
        'academicWorkId',
        'workVersionId',
        'level',
        'verbatimExcerpt',
        'sourcedStatement',
        'sourceLocatorId',
        'sourceProvider',
        'sourceUrl',
        'retrievedAt',
        'contentHash',
        'extractionMethod',
        'qualityNotes',
      ],
      'additionalProperties': false,
    },
    'value83': {
      'anyOf': [
        {
          'const': 'abstract',
        },
        {
          'const': 'metadata',
        },
        {
          'const': 'fulltext',
        },
      ],
    },
    'value84': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value89',
        },
      ],
    },
    'value85': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'unknown',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value86': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'not_applicable',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value87': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'not_extracted',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
      ],
      'additionalProperties': false,
    },
    'value88': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'failed',
        },
        'failureId': {
          'type': 'string',
          'minLength': 1,
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'failureId',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value89': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value90': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value91',
      },
    },
    'value91': {
      'type': 'object',
      'properties': {
        'evidenceId': {
          'type': 'string',
          'minLength': 1,
        },
        'question': {
          'type': 'string',
        },
      },
      'required': [
        'evidenceId',
        'question',
      ],
      'additionalProperties': false,
    },
    'value92': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'evidenceCardId': {
          'type': 'string',
          'minLength': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchQuestions': {
          '$ref': '#/$defs/value93',
        },
        'methods': {
          '$ref': '#/$defs/value99',
        },
        'datasets': {
          '$ref': '#/$defs/value104',
        },
        'metrics': {
          '$ref': '#/$defs/value106',
        },
        'findings': {
          '$ref': '#/$defs/value114',
        },
        'limitations': {
          '$ref': '#/$defs/value119',
        },
      },
      'required': [
        'schemaVersion',
        'evidenceCardId',
        'academicWorkId',
        'workVersionId',
        'researchQuestions',
        'methods',
        'datasets',
        'metrics',
        'findings',
        'limitations',
      ],
      'additionalProperties': false,
    },
    'value93': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value94',
      },
    },
    'value94': {
      'type': 'object',
      'properties': {
        'questionType': {
          '$ref': '#/$defs/value95',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'questionType',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value95': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value96',
        },
      ],
    },
    'value96': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value97',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value97': {
      'anyOf': [
        {
          'const': 'descriptive',
        },
        {
          'const': 'comparative',
        },
        {
          'const': 'causal',
        },
        {
          'const': 'exploratory',
        },
        {
          'const': 'other',
        },
      ],
    },
    'value98': {
      'type': 'array',
      'items': {
        'type': 'string',
        'minLength': 1,
      },
      'minItems': 1,
    },
    'value99': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value100',
      },
    },
    'value100': {
      'type': 'object',
      'properties': {
        'methodName': {
          '$ref': '#/$defs/value84',
        },
        'methodRole': {
          '$ref': '#/$defs/value101',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'methodName',
        'methodRole',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value101': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value102',
        },
      ],
    },
    'value102': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value103',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value103': {
      'anyOf': [
        {
          'const': 'other',
        },
        {
          'const': 'proposed',
        },
        {
          'const': 'baseline',
        },
        {
          'const': 'evaluation',
        },
        {
          'const': 'analysis',
        },
      ],
    },
    'value104': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value105',
      },
    },
    'value105': {
      'type': 'object',
      'properties': {
        'datasetName': {
          '$ref': '#/$defs/value84',
        },
        'version': {
          '$ref': '#/$defs/value84',
        },
        'split': {
          '$ref': '#/$defs/value84',
        },
        'scale': {
          '$ref': '#/$defs/value84',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'datasetName',
        'version',
        'split',
        'scale',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value106': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value107',
      },
    },
    'value107': {
      'type': 'object',
      'properties': {
        'metricName': {
          '$ref': '#/$defs/value84',
        },
        'value': {
          '$ref': '#/$defs/value108',
        },
        'unit': {
          '$ref': '#/$defs/value84',
        },
        'direction': {
          '$ref': '#/$defs/value111',
        },
        'evaluationContext': {
          '$ref': '#/$defs/value84',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'metricName',
        'value',
        'unit',
        'direction',
        'evaluationContext',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value108': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value109',
        },
      ],
    },
    'value109': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value110',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value110': {
      'anyOf': [
        {
          'type': 'string',
        },
        {
          'type': 'number',
        },
      ],
    },
    'value111': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value112',
        },
      ],
    },
    'value112': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value113',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value113': {
      'anyOf': [
        {
          'const': 'higher_better',
        },
        {
          'const': 'lower_better',
        },
        {
          'const': 'context_dependent',
        },
      ],
    },
    'value114': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value115',
      },
    },
    'value115': {
      'type': 'object',
      'properties': {
        'findingType': {
          '$ref': '#/$defs/value116',
        },
        'conditions': {
          '$ref': '#/$defs/value84',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'findingType',
        'conditions',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value116': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value117',
        },
      ],
    },
    'value117': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value118',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value118': {
      'anyOf': [
        {
          'const': 'other',
        },
        {
          'const': 'primary',
        },
        {
          'const': 'secondary',
        },
        {
          'const': 'negative',
        },
        {
          'const': 'null_result',
        },
      ],
    },
    'value119': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value120',
      },
    },
    'value120': {
      'type': 'object',
      'properties': {
        'limitationType': {
          '$ref': '#/$defs/value121',
        },
        'evidenceCardItemId': {
          'type': 'string',
          'minLength': 1,
        },
        'statement': {
          'type': 'string',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value98',
        },
      },
      'required': [
        'limitationType',
        'evidenceCardItemId',
        'statement',
        'evidenceIds',
      ],
      'additionalProperties': false,
    },
    'value121': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value122',
        },
      ],
    },
    'value122': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value123',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value123': {
      'anyOf': [
        {
          'const': 'other',
        },
        {
          'const': 'evaluation',
        },
        {
          'const': 'data',
        },
        {
          'const': 'method',
        },
        {
          'const': 'generalizability',
        },
        {
          'const': 'author_stated',
        },
      ],
    },
    'value124': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value125',
      },
    },
    'value125': {
      'type': 'object',
      'properties': {
        'draftIndex': {
          'type': 'number',
        },
        'segmentIndex': {
          'type': 'number',
        },
        'code': {
          '$ref': '#/$defs/value126',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'draftIndex',
        'segmentIndex',
        'code',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value126': {
      'anyOf': [
        {
          'const': 'EVIDENCE_EMPTY_EXCERPT',
        },
        {
          'const': 'EVIDENCE_INVALID_SEGMENT_INDEX',
        },
        {
          'const': 'EVIDENCE_EXCERPT_NOT_FOUND',
        },
        {
          'const': 'EVIDENCE_INVALID_QUESTION_INDEX',
        },
      ],
    },
    'value127': {
      'type': 'object',
      'properties': {
        'input': {
          '$ref': '#/$defs/value128',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'config': {
          '$ref': '#/$defs/value7',
        },
        'messages': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string',
                'minLength': 1,
              },
              'role': {
                'const': 'user',
              },
              'source': {
                'type': 'object',
                'properties': {
                  'kind': {
                    'const': 'plugin',
                  },
                  'plugin': {
                    'const': 'dsh-academic-workflow',
                  },
                },
                'required': [
                  'kind',
                  'plugin',
                ],
                'additionalProperties': false,
              },
              'content': {
                'type': 'array',
                'items': {
                  'type': 'object',
                  'properties': {
                    'type': {
                      'const': 'text',
                    },
                    'text': {
                      'type': 'string',
                    },
                  },
                  'required': [
                    'type',
                    'text',
                  ],
                  'additionalProperties': false,
                },
              },
            },
            'required': [
              'id',
              'role',
              'source',
              'content',
            ],
            'additionalProperties': false,
          },
        },
        'estimatedInputTokens': {
          'type': 'number',
        },
        'contextWindow': {
          'type': 'number',
        },
        'outputTokens': {
          'type': 'number',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'decision': {
          '$ref': '#/$defs/value37',
        },
      },
      'required': [
        'input',
        'config',
        'messages',
        'estimatedInputTokens',
        'contextWindow',
        'outputTokens',
        'attempt',
        'maxAttempts',
        'decision',
      ],
      'additionalProperties': false,
    },
    'value128': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'synthetic': {
          'type': 'boolean',
        },
        'brief': {
          '$ref': '#/$defs/value129',
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'analysisInput': {
          '$ref': '#/$defs/value146',
        },
        'coverageSummary': {
          '$ref': '#/$defs/value168',
        },
        'sourceFailures': {
          '$ref': '#/$defs/value169',
        },
      },
      'required': [
        'schemaVersion',
        'synthetic',
        'brief',
        'retrievalRunId',
        'analysisInput',
        'coverageSummary',
        'sourceFailures',
      ],
      'additionalProperties': false,
    },
    'value129': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'version': {
          'type': 'number',
        },
        'topic': {
          'type': 'string',
        },
        'aliases': {
          '$ref': '#/$defs/value46',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'publicationWindow': {
          '$ref': '#/$defs/value130',
        },
        'includedWorkTypes': {
          '$ref': '#/$defs/value46',
        },
        'inclusionRules': {
          '$ref': '#/$defs/value46',
        },
        'exclusionRules': {
          '$ref': '#/$defs/value46',
        },
        'evidenceRequirements': {
          '$ref': '#/$defs/value135',
        },
        'targetAudience': {
          'type': 'string',
        },
        'reportRequirements': {
          '$ref': '#/$defs/value138',
        },
        'stopConditions': {
          '$ref': '#/$defs/value141',
        },
        'assumptions': {
          '$ref': '#/$defs/value46',
        },
        'approval': {
          '$ref': '#/$defs/value142',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'version',
        'topic',
        'aliases',
        'questions',
        'publicationWindow',
        'includedWorkTypes',
        'inclusionRules',
        'exclusionRules',
        'evidenceRequirements',
        'targetAudience',
        'reportRequirements',
        'stopConditions',
        'assumptions',
        'approval',
      ],
      'additionalProperties': false,
    },
    'value130': {
      'type': 'object',
      'properties': {
        'start': {
          '$ref': '#/$defs/value131',
        },
        'end': {
          '$ref': '#/$defs/value131',
        },
        'dateBasis': {
          '$ref': '#/$defs/value134',
        },
      },
      'required': [
        'start',
        'end',
        'dateBasis',
      ],
      'additionalProperties': false,
    },
    'value131': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value132',
        },
      ],
    },
    'value132': {
      'type': 'object',
      'properties': {
        'iso': {
          'type': 'string',
        },
        'precision': {
          '$ref': '#/$defs/value133',
        },
      },
      'required': [
        'iso',
        'precision',
      ],
      'additionalProperties': false,
    },
    'value133': {
      'anyOf': [
        {
          'const': 'year',
        },
        {
          'const': 'month',
        },
        {
          'const': 'day',
        },
      ],
    },
    'value134': {
      'anyOf': [
        {
          'const': 'published',
        },
        {
          'const': 'first_public_release',
        },
      ],
    },
    'value135': {
      'type': 'object',
      'properties': {
        'minimumIncludedWorks': {
          'type': 'number',
        },
        'targetIncludedWorks': {
          'type': 'number',
        },
        'minimumFulltextWorks': {
          'type': 'number',
        },
        'minimumEvidenceLevel': {
          '$ref': '#/$defs/value136',
        },
        'requireLocatableEvidence': {
          'type': 'boolean',
        },
        'allowPreprints': {
          'type': 'boolean',
        },
        'insufficientEvidencePolicy': {
          '$ref': '#/$defs/value137',
        },
      },
      'required': [
        'minimumIncludedWorks',
        'minimumFulltextWorks',
        'minimumEvidenceLevel',
        'requireLocatableEvidence',
        'allowPreprints',
        'insufficientEvidencePolicy',
      ],
      'additionalProperties': false,
    },
    'value136': {
      'anyOf': [
        {
          'const': 'abstract',
        },
        {
          'const': 'fulltext',
        },
      ],
    },
    'value137': {
      'anyOf': [
        {
          'const': 'continue_with_warning',
        },
        {
          'const': 'stop_for_review',
        },
      ],
    },
    'value138': {
      'type': 'object',
      'properties': {
        'language': {
          'type': 'string',
        },
        'targetLength': {
          '$ref': '#/$defs/value139',
        },
        'requiredSections': {
          '$ref': '#/$defs/value46',
        },
        'citationStyle': {
          '$ref': '#/$defs/value140',
        },
        'includeEvidenceAppendix': {
          'type': 'boolean',
        },
        'includeMethodology': {
          'type': 'boolean',
        },
        'includeLimitations': {
          'type': 'boolean',
        },
        'includeResearchGaps': {
          'type': 'boolean',
        },
      },
      'required': [
        'language',
        'targetLength',
        'requiredSections',
        'citationStyle',
        'includeEvidenceAppendix',
        'includeMethodology',
        'includeLimitations',
        'includeResearchGaps',
      ],
      'additionalProperties': false,
    },
    'value139': {
      'type': 'object',
      'properties': {
        'unit': {
          'type': 'string',
        },
        'minimum': {
          '$ref': '#/$defs/value79',
        },
        'maximum': {
          '$ref': '#/$defs/value79',
        },
      },
      'required': [
        'unit',
        'minimum',
        'maximum',
      ],
      'additionalProperties': false,
    },
    'value140': {
      'anyOf': [
        {
          'const': 'numeric',
        },
        {
          'const': 'author_year',
        },
      ],
    },
    'value141': {
      'type': 'object',
      'properties': {
        'maximumSearchRounds': {
          'type': 'number',
        },
        'maximumCandidateWorks': {
          'type': 'number',
        },
        'maximumIncludedWorks': {
          'type': 'number',
        },
        'maximumElapsedMinutes': {
          '$ref': '#/$defs/value79',
        },
        'saturationRounds': {
          'type': 'number',
        },
        'stopWhenEvidenceRequirementsMet': {
          'type': 'boolean',
        },
      },
      'required': [
        'maximumSearchRounds',
        'maximumCandidateWorks',
        'maximumIncludedWorks',
        'maximumElapsedMinutes',
        'saturationRounds',
        'stopWhenEvidenceRequirementsMet',
      ],
      'additionalProperties': false,
    },
    'value142': {
      'anyOf': [
        {
          '$ref': '#/$defs/value143',
        },
        {
          '$ref': '#/$defs/value144',
        },
        {
          '$ref': '#/$defs/value145',
        },
      ],
    },
    'value143': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'pending',
        },
      },
      'required': [
        'status',
      ],
      'additionalProperties': false,
    },
    'value144': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'approved',
        },
        'reviewedBy': {
          'type': 'string',
        },
        'reviewedAt': {
          'type': 'string',
        },
        'approvedBriefVersion': {
          'type': 'number',
        },
        'comment': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'status',
        'reviewedBy',
        'reviewedAt',
        'approvedBriefVersion',
        'comment',
      ],
      'additionalProperties': false,
    },
    'value145': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'revision_requested',
        },
        'reviewedBy': {
          'type': 'string',
        },
        'reviewedAt': {
          'type': 'string',
        },
        'reviewedBriefVersion': {
          'type': 'number',
        },
        'comment': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reviewedBy',
        'reviewedAt',
        'reviewedBriefVersion',
        'comment',
      ],
      'additionalProperties': false,
    },
    'value146': {
      'type': 'object',
      'properties': {
        'academicWorks': {
          '$ref': '#/$defs/value147',
        },
        'workVersions': {
          '$ref': '#/$defs/value158',
        },
        'evidenceRecords': {
          '$ref': '#/$defs/value81',
        },
        'questionLinks': {
          '$ref': '#/$defs/value165',
        },
        'evidenceCards': {
          '$ref': '#/$defs/value167',
        },
        'sourceLocators': {
          '$ref': '#/$defs/value71',
        },
      },
      'required': [
        'academicWorks',
        'workVersions',
        'evidenceRecords',
        'evidenceCards',
        'sourceLocators',
      ],
      'additionalProperties': false,
    },
    'value147': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value148',
      },
    },
    'value148': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'title': {
          'type': 'string',
        },
        'authors': {
          '$ref': '#/$defs/value46',
        },
        'externalIdentifiers': {
          '$ref': '#/$defs/value149',
        },
        'workVersionIds': {
          '$ref': '#/$defs/value152',
        },
        'canonicalVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'firstPublicDate': {
          '$ref': '#/$defs/value153',
        },
        'publicationStatus': {
          '$ref': '#/$defs/value155',
        },
        'venue': {
          '$ref': '#/$defs/value84',
        },
      },
      'required': [
        'schemaVersion',
        'academicWorkId',
        'title',
        'authors',
        'externalIdentifiers',
        'workVersionIds',
        'canonicalVersionId',
        'firstPublicDate',
        'publicationStatus',
        'venue',
      ],
      'additionalProperties': false,
    },
    'value149': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value150',
      },
    },
    'value150': {
      'type': 'object',
      'properties': {
        'kind': {
          '$ref': '#/$defs/value151',
        },
        'normalizedValue': {
          'type': 'string',
        },
        'originalValue': {
          'type': 'string',
        },
        'sourceProvider': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'normalizedValue',
        'originalValue',
        'sourceProvider',
      ],
      'additionalProperties': false,
    },
    'value151': {
      'anyOf': [
        {
          'const': 'provider_record',
        },
        {
          'const': 'doi',
        },
        {
          'const': 'arxiv',
        },
        {
          'const': 'openalex',
        },
        {
          'const': 'pubmed',
        },
      ],
    },
    'value152': {
      'type': 'array',
      'items': {
        'type': 'string',
        'minLength': 1,
      },
    },
    'value153': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value154',
        },
      ],
    },
    'value154': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value132',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value155': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value156',
        },
      ],
    },
    'value156': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value157',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value157': {
      'anyOf': [
        {
          'const': 'unknown',
        },
        {
          'const': 'published',
        },
        {
          'const': 'preprint',
        },
        {
          'const': 'accepted',
        },
        {
          'const': 'corrected',
        },
        {
          'const': 'retracted',
        },
      ],
    },
    'value158': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value159',
      },
    },
    'value159': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'versionType': {
          '$ref': '#/$defs/value160',
        },
        'versionLabel': {
          '$ref': '#/$defs/value84',
        },
        'releaseDate': {
          '$ref': '#/$defs/value153',
        },
        'externalIdentifiers': {
          '$ref': '#/$defs/value149',
        },
        'sourceRecords': {
          '$ref': '#/$defs/value161',
        },
        'contentHash': {
          '$ref': '#/$defs/value84',
        },
        'supersedesWorkVersionId': {
          '$ref': '#/$defs/value163',
        },
        'status': {
          '$ref': '#/$defs/value164',
        },
      },
      'required': [
        'schemaVersion',
        'workVersionId',
        'academicWorkId',
        'versionType',
        'versionLabel',
        'releaseDate',
        'externalIdentifiers',
        'sourceRecords',
        'contentHash',
        'supersedesWorkVersionId',
        'status',
      ],
      'additionalProperties': false,
    },
    'value160': {
      'anyOf': [
        {
          'const': 'unknown',
        },
        {
          'const': 'preprint',
        },
        {
          'const': 'corrected',
        },
        {
          'const': 'retracted',
        },
        {
          'const': 'accepted_manuscript',
        },
        {
          'const': 'version_of_record',
        },
      ],
    },
    'value161': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value162',
      },
    },
    'value162': {
      'type': 'object',
      'properties': {
        'provider': {
          'type': 'string',
        },
        'recordId': {
          'type': 'string',
        },
      },
      'required': [
        'provider',
        'recordId',
      ],
      'additionalProperties': false,
    },
    'value163': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'string',
          'minLength': 1,
        },
      ],
    },
    'value164': {
      'anyOf': [
        {
          'const': 'corrected',
        },
        {
          'const': 'retracted',
        },
        {
          'const': 'active',
        },
      ],
    },
    'value165': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value166',
      },
    },
    'value166': {
      'type': 'object',
      'properties': {
        'evidenceId': {
          'type': 'string',
          'minLength': 1,
        },
        'question': {
          'type': 'string',
        },
      },
      'required': [
        'evidenceId',
        'question',
      ],
      'additionalProperties': false,
    },
    'value167': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value92',
      },
    },
    'value168': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'discoveredRecords': {
          'type': 'number',
        },
        'deduplicatedWorks': {
          'type': 'number',
        },
        'includedWorks': {
          'type': 'number',
        },
        'availableFulltextWorks': {
          'type': 'number',
        },
        'abstractOnlyWorks': {
          'type': 'number',
        },
        'metadataOnlyWorks': {
          'type': 'number',
        },
        'failedOperations': {
          'type': 'number',
        },
        'truncated': {
          'type': 'boolean',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
        'providerBreakdown': {
          'type': 'null',
        },
      },
      'required': [
        'schemaVersion',
        'discoveredRecords',
        'deduplicatedWorks',
        'includedWorks',
        'availableFulltextWorks',
        'abstractOnlyWorks',
        'metadataOnlyWorks',
        'failedOperations',
        'truncated',
        'limitations',
        'providerBreakdown',
      ],
      'additionalProperties': false,
    },
    'value169': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value170',
      },
    },
    'value170': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'failureId': {
          'type': 'string',
          'minLength': 1,
        },
        'provider': {
          'type': 'string',
        },
        'operation': {
          'type': 'string',
        },
        'category': {
          '$ref': '#/$defs/value171',
        },
        'message': {
          'type': 'string',
        },
        'retryable': {
          'type': 'boolean',
        },
        'retryAfter': {
          '$ref': '#/$defs/value74',
        },
        'affectedWorkVersionId': {
          'type': 'string',
          'minLength': 1,
        },
      },
      'required': [
        'schemaVersion',
        'failureId',
        'provider',
        'operation',
        'category',
        'message',
        'retryable',
        'retryAfter',
      ],
      'additionalProperties': false,
    },
    'value171': {
      'anyOf': [
        {
          'const': 'unknown',
        },
        {
          'const': 'invalid_request',
        },
        {
          'const': 'authentication_failed',
        },
        {
          'const': 'rate_limited',
        },
        {
          'const': 'timeout',
        },
        {
          'const': 'network_error',
        },
        {
          'const': 'upstream_error',
        },
        {
          'const': 'not_found',
        },
        {
          'const': 'parse_failed',
        },
        {
          'const': 'fulltext_unavailable',
        },
      ],
    },
    'value172': {
      'type': 'object',
      'properties': {
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'status': {
          '$ref': '#/$defs/value173',
        },
        'rejectedStatements': {
          '$ref': '#/$defs/value174',
        },
        'usage': {
          '$ref': '#/$defs/value58',
        },
        'finish': {
          '$ref': '#/$defs/value60',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'requestSeq': {
          '$ref': '#/$defs/value39',
        },
        'elapsedMs': {
          'type': 'number',
        },
        'firstContentElapsedMs': {
          'type': 'number',
        },
        'failurePhase': {
          '$ref': '#/$defs/value41',
        },
        'stream': {
          '$ref': '#/$defs/value42',
        },
        'errorCode': {
          'type': 'string',
        },
      },
      'required': [
        'retrievalRunId',
        'status',
        'attempt',
        'maxAttempts',
        'requestSeq',
        'stream',
      ],
      'additionalProperties': false,
    },
    'value173': {
      'anyOf': [
        {
          'const': 'validated',
        },
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'skipped',
        },
        {
          'const': 'partially_validated',
        },
      ],
    },
    'value174': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value175',
      },
    },
    'value175': {
      'type': 'object',
      'properties': {
        'statementIndex': {
          'type': 'number',
        },
        'code': {
          'type': 'string',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'statementIndex',
        'code',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value176': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'maximumSearchRounds': {
          'type': 'number',
        },
        'queries': {
          '$ref': '#/$defs/value177',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'researchBriefVersion',
        'maximumSearchRounds',
        'queries',
      ],
      'additionalProperties': false,
    },
    'value177': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value178',
      },
    },
    'value178': {
      'type': 'object',
      'properties': {
        'searchQueryId': {
          'type': 'string',
          'minLength': 1,
        },
        'kind': {
          '$ref': '#/$defs/value179',
        },
        'expression': {
          'type': 'string',
        },
        'purpose': {
          'type': 'string',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'roundIndex': {
          'type': 'number',
        },
        'providers': {
          '$ref': '#/$defs/value46',
        },
        'maximumResults': {
          '$ref': '#/$defs/value79',
        },
        'siteHost': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'searchQueryId',
        'kind',
        'expression',
        'purpose',
        'questions',
        'roundIndex',
        'providers',
        'maximumResults',
        'siteHost',
      ],
      'additionalProperties': false,
    },
    'value179': {
      'anyOf': [
        {
          'const': 'academic',
        },
        {
          'const': 'web_discovery',
        },
        {
          'const': 'site_restricted',
        },
      ],
    },
    'value180': {
      'type': 'object',
      'properties': {
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'batchIndex': {
          '$ref': '#/$defs/value79',
        },
        'action': {
          '$ref': '#/$defs/value181',
        },
        'workVersionIds': {
          '$ref': '#/$defs/value152',
        },
        'searchQuestions': {
          '$ref': '#/$defs/value46',
        },
        'reason': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'retrievalRunId',
        'batchIndex',
        'action',
        'workVersionIds',
        'searchQuestions',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value181': {
      'anyOf': [
        {
          'const': 'stop',
        },
        {
          'const': 'schedule_batch',
        },
        {
          'const': 'search_evidence_gap',
        },
      ],
    },
    'value182': {
      'type': 'object',
      'properties': {
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'batchIndex': {
          'type': 'number',
        },
        'admittedEvidence': {
          'type': 'number',
        },
        'coverage': {
          '$ref': '#/$defs/value183',
        },
        'completedAt': {
          'type': 'string',
        },
      },
      'required': [
        'retrievalRunId',
        'batchIndex',
        'admittedEvidence',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value183': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'assessedAt': {
          'type': 'string',
        },
        'questions': {
          '$ref': '#/$defs/value184',
        },
        'evidenceRequirementsMet': {
          'type': 'boolean',
        },
        'allQuestionsCovered': {
          'type': 'boolean',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'researchBriefVersion',
        'assessedAt',
        'questions',
        'evidenceRequirementsMet',
        'allQuestionsCovered',
      ],
      'additionalProperties': false,
    },
    'value184': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value185',
      },
    },
    'value185': {
      'type': 'object',
      'properties': {
        'question': {
          'type': 'string',
        },
        'status': {
          '$ref': '#/$defs/value186',
        },
        'supportingWorkIds': {
          '$ref': '#/$defs/value187',
        },
        'evidenceIds': {
          '$ref': '#/$defs/value188',
        },
        'gaps': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'question',
        'status',
        'supportingWorkIds',
        'evidenceIds',
        'gaps',
      ],
      'additionalProperties': false,
    },
    'value186': {
      'anyOf': [
        {
          'const': 'uncovered',
        },
        {
          'const': 'partial',
        },
        {
          'const': 'covered',
        },
      ],
    },
    'value187': {
      'type': 'array',
      'items': {
        'type': 'string',
        'minLength': 1,
      },
    },
    'value188': {
      'type': 'array',
      'items': {
        'type': 'string',
        'minLength': 1,
      },
    },
    'value189': {
      'type': 'object',
      'properties': {
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'status': {
          '$ref': '#/$defs/value190',
        },
        'completedAt': {
          'type': 'string',
        },
      },
      'required': [
        'retrievalRunId',
        'status',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value190': {
      'anyOf': [
        {
          'const': 'cancelled',
        },
        {
          'const': 'completed',
        },
      ],
    },
    'value191': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'startedAt': {
          'type': 'string',
        },
        'executedQueries': {
          '$ref': '#/$defs/value46',
        },
        'search': {
          '$ref': '#/$defs/value192',
        },
        'works': {
          '$ref': '#/$defs/value147',
        },
        'versions': {
          '$ref': '#/$defs/value158',
        },
        'candidates': {
          '$ref': '#/$defs/value194',
        },
        'plan': {
          '$ref': '#/$defs/value196',
        },
        'assessments': {
          '$ref': '#/$defs/value211',
        },
        'ranking': {
          '$ref': '#/$defs/value247',
        },
        'policy': {
          '$ref': '#/$defs/value262',
        },
        'rounds': {
          '$ref': '#/$defs/value263',
        },
        'decisions': {
          '$ref': '#/$defs/value266',
        },
        'settlements': {
          '$ref': '#/$defs/value267',
        },
        'coverage': {
          '$ref': '#/$defs/value268',
        },
        'papers': {
          '$ref': '#/$defs/value269',
        },
        'paperFailures': {
          '$ref': '#/$defs/value279',
        },
        'providerFailures': {
          '$ref': '#/$defs/value169',
        },
        'availableFulltextWorks': {
          'type': 'number',
        },
        'selectionTruncated': {
          'type': 'boolean',
        },
        'selectionLimitations': {
          '$ref': '#/$defs/value46',
        },
        'scheduledWorkVersionIds': {
          '$ref': '#/$defs/value152',
        },
        'completedBatchCount': {
          'type': 'number',
        },
        'consecutiveBatchesWithoutEvidence': {
          'type': 'number',
        },
        'completedSearchRounds': {
          'type': 'number',
        },
        'pendingBatchIndex': {
          '$ref': '#/$defs/value79',
        },
      },
      'required': [
        'schemaVersion',
        'retrievalRunId',
        'startedAt',
        'executedQueries',
        'search',
        'works',
        'versions',
        'candidates',
        'plan',
        'assessments',
        'ranking',
        'policy',
        'rounds',
        'decisions',
        'settlements',
        'coverage',
        'papers',
        'paperFailures',
        'providerFailures',
        'availableFulltextWorks',
        'selectionTruncated',
        'selectionLimitations',
        'scheduledWorkVersionIds',
        'completedBatchCount',
        'consecutiveBatchesWithoutEvidence',
        'completedSearchRounds',
        'pendingBatchIndex',
      ],
      'additionalProperties': false,
    },
    'value192': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value193',
        },
      ],
    },
    'value193': {
      'type': 'object',
      'properties': {
        'providers': {
          '$ref': '#/$defs/value46',
        },
        'discoveredRecords': {
          'type': 'number',
        },
        'deduplicatedWorks': {
          'type': 'number',
        },
        'failures': {
          '$ref': '#/$defs/value169',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
        'truncated': {
          'type': 'boolean',
        },
      },
      'required': [
        'providers',
        'discoveredRecords',
        'deduplicatedWorks',
        'failures',
        'limitations',
        'truncated',
      ],
      'additionalProperties': false,
    },
    'value194': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value195',
      },
    },
    'value195': {
      'type': 'object',
      'properties': {
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'urls': {
          '$ref': '#/$defs/value46',
        },
        'sourceProvider': {
          'type': 'string',
        },
        'extractionMethod': {
          '$ref': '#/$defs/value2',
        },
        'hasHistoricalEvidence': {
          'type': 'boolean',
        },
        'version': {
          '$ref': '#/$defs/value159',
        },
      },
      'required': [
        'workVersionId',
        'urls',
        'sourceProvider',
        'extractionMethod',
        'hasHistoricalEvidence',
        'version',
      ],
      'additionalProperties': false,
    },
    'value196': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'constraints': {
          '$ref': '#/$defs/value197',
        },
        'inclusionTargets': {
          '$ref': '#/$defs/value198',
        },
        'rankingPolicy': {
          '$ref': '#/$defs/value199',
        },
        'queries': {
          '$ref': '#/$defs/value202',
        },
        'citationExpansionSeeds': {
          '$ref': '#/$defs/value208',
        },
        'maximumSearchRounds': {
          'type': 'number',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'researchBriefVersion',
        'constraints',
        'inclusionTargets',
        'rankingPolicy',
        'queries',
        'citationExpansionSeeds',
        'maximumSearchRounds',
      ],
      'additionalProperties': false,
    },
    'value197': {
      'type': 'object',
      'properties': {
        'publicationWindow': {
          '$ref': '#/$defs/value130',
        },
        'includedWorkTypes': {
          '$ref': '#/$defs/value46',
        },
        'inclusionRules': {
          '$ref': '#/$defs/value46',
        },
        'exclusionRules': {
          '$ref': '#/$defs/value46',
        },
        'requiredTerms': {
          '$ref': '#/$defs/value46',
        },
        'excludedTerms': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'publicationWindow',
        'includedWorkTypes',
        'inclusionRules',
        'exclusionRules',
        'requiredTerms',
        'excludedTerms',
      ],
      'additionalProperties': false,
    },
    'value198': {
      'type': 'object',
      'properties': {
        'minimum': {
          'type': 'number',
        },
        'target': {
          'type': 'number',
        },
        'maximum': {
          'type': 'number',
        },
      },
      'required': [
        'minimum',
        'target',
        'maximum',
      ],
      'additionalProperties': false,
    },
    'value199': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'weights': {
          '$ref': '#/$defs/value200',
        },
        'thresholds': {
          '$ref': '#/$defs/value201',
        },
      },
      'required': [
        'schemaVersion',
        'weights',
        'thresholds',
      ],
      'additionalProperties': false,
    },
    'value200': {
      'type': 'object',
      'properties': {
        'topicRelevance': {
          'type': 'number',
        },
        'questionMatch': {
          'type': 'number',
        },
        'evidencePotential': {
          'type': 'number',
        },
        'methodMatch': {
          'type': 'number',
        },
        'workTypeFit': {
          'type': 'number',
        },
        'sourceQuality': {
          'type': 'number',
        },
        'recency': {
          'type': 'number',
        },
        'fulltextAvailability': {
          'type': 'number',
        },
      },
      'required': [
        'topicRelevance',
        'questionMatch',
        'evidencePotential',
        'methodMatch',
        'workTypeFit',
        'sourceQuality',
        'recency',
        'fulltextAvailability',
      ],
      'additionalProperties': false,
    },
    'value201': {
      'type': 'object',
      'properties': {
        'p0': {
          'type': 'number',
        },
        'p1': {
          'type': 'number',
        },
        'p2': {
          'type': 'number',
        },
      },
      'required': [
        'p0',
        'p1',
        'p2',
      ],
      'additionalProperties': false,
    },
    'value202': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value203',
      },
    },
    'value203': {
      'anyOf': [
        {
          '$ref': '#/$defs/value204',
        },
        {
          '$ref': '#/$defs/value206',
        },
        {
          '$ref': '#/$defs/value207',
        },
      ],
    },
    'value204': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'academic',
        },
        'providers': {
          '$ref': '#/$defs/value46',
        },
        'searchQueryId': {
          'type': 'string',
          'minLength': 1,
        },
        'expression': {
          'type': 'string',
        },
        'purpose': {
          '$ref': '#/$defs/value205',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'roundIndex': {
          'type': 'number',
        },
      },
      'required': [
        'kind',
        'providers',
        'searchQueryId',
        'expression',
        'purpose',
        'questions',
        'roundIndex',
      ],
      'additionalProperties': false,
    },
    'value205': {
      'anyOf': [
        {
          'const': 'site_restricted',
        },
        {
          'const': 'core',
        },
        {
          'const': 'synonym_expansion',
        },
        {
          'const': 'citation_expansion',
        },
        {
          'const': 'evidence_gap',
        },
      ],
    },
    'value206': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'web_discovery',
        },
        'maximumResults': {
          'type': 'number',
        },
        'searchQueryId': {
          'type': 'string',
          'minLength': 1,
        },
        'expression': {
          'type': 'string',
        },
        'purpose': {
          '$ref': '#/$defs/value205',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'roundIndex': {
          'type': 'number',
        },
      },
      'required': [
        'kind',
        'maximumResults',
        'searchQueryId',
        'expression',
        'purpose',
        'questions',
        'roundIndex',
      ],
      'additionalProperties': false,
    },
    'value207': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'site_restricted',
        },
        'siteHost': {
          'type': 'string',
        },
        'maximumResults': {
          'type': 'number',
        },
        'searchQueryId': {
          'type': 'string',
          'minLength': 1,
        },
        'expression': {
          'type': 'string',
        },
        'purpose': {
          '$ref': '#/$defs/value205',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'roundIndex': {
          'type': 'number',
        },
      },
      'required': [
        'kind',
        'siteHost',
        'maximumResults',
        'searchQueryId',
        'expression',
        'purpose',
        'questions',
        'roundIndex',
      ],
      'additionalProperties': false,
    },
    'value208': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value209',
      },
    },
    'value209': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'direction': {
          '$ref': '#/$defs/value210',
        },
        'purpose': {
          '$ref': '#/$defs/value205',
        },
        'questions': {
          '$ref': '#/$defs/value46',
        },
        'roundIndex': {
          'type': 'number',
        },
        'maximumResults': {
          'type': 'number',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'direction',
        'purpose',
        'questions',
        'roundIndex',
        'maximumResults',
      ],
      'additionalProperties': false,
    },
    'value210': {
      'anyOf': [
        {
          'const': 'references',
        },
        {
          'const': 'citations',
        },
        {
          'const': 'related',
        },
      ],
    },
    'value211': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value212',
      },
    },
    'value212': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'abstract': {
          '$ref': '#/$defs/value84',
        },
        'keywords': {
          '$ref': '#/$defs/value213',
        },
        'fulltextAvailability': {
          '$ref': '#/$defs/value215',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value46',
        },
        'screening': {
          '$ref': '#/$defs/value219',
        },
        'semanticReview': {
          '$ref': '#/$defs/value236',
        },
        'contributionSignals': {
          '$ref': '#/$defs/value243',
        },
        'topicRelevance': {
          'type': 'number',
        },
        'evidencePotential': {
          'type': 'number',
        },
        'methodMatch': {
          'type': 'number',
        },
        'sourceQuality': {
          'type': 'number',
        },
        'recency': {
          'type': 'number',
        },
        'inclusionRuleMatches': {
          '$ref': '#/$defs/value244',
        },
        'exclusionRuleMatches': {
          '$ref': '#/$defs/value244',
        },
        'diversityTags': {
          '$ref': '#/$defs/value46',
        },
        'reasons': {
          '$ref': '#/$defs/value246',
        },
      },
      'required': [
        'academicWorkId',
        'abstract',
        'keywords',
        'fulltextAvailability',
        'matchedQuestions',
        'contributionSignals',
        'topicRelevance',
        'evidencePotential',
        'methodMatch',
        'sourceQuality',
        'recency',
        'inclusionRuleMatches',
        'exclusionRuleMatches',
        'diversityTags',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value213': {
      'anyOf': [
        {
          '$ref': '#/$defs/value85',
        },
        {
          '$ref': '#/$defs/value86',
        },
        {
          '$ref': '#/$defs/value87',
        },
        {
          '$ref': '#/$defs/value88',
        },
        {
          '$ref': '#/$defs/value214',
        },
      ],
    },
    'value214': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'status',
        'value',
      ],
      'additionalProperties': false,
    },
    'value215': {
      'anyOf': [
        {
          '$ref': '#/$defs/value216',
        },
        {
          '$ref': '#/$defs/value217',
        },
        {
          '$ref': '#/$defs/value218',
        },
      ],
    },
    'value216': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'resolvable',
        },
      },
      'required': [
        'status',
      ],
      'additionalProperties': false,
    },
    'value217': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'unresolved',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value218': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'unknown',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value219': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'signals': {
          '$ref': '#/$defs/value220',
        },
        'surfaceKeywordHits': {
          '$ref': '#/$defs/value229',
        },
        'uncertainties': {
          '$ref': '#/$defs/value46',
        },
        'scope': {
          '$ref': '#/$defs/value232',
        },
      },
      'required': [
        'schemaVersion',
        'signals',
        'surfaceKeywordHits',
        'uncertainties',
        'scope',
      ],
      'additionalProperties': false,
    },
    'value220': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value221',
      },
    },
    'value221': {
      'anyOf': [
        {
          '$ref': '#/$defs/value222',
        },
        {
          '$ref': '#/$defs/value225',
        },
        {
          '$ref': '#/$defs/value227',
        },
      ],
    },
    'value222': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'question',
        },
        'question': {
          'type': 'string',
        },
        'quote': {
          '$ref': '#/$defs/value223',
        },
      },
      'required': [
        'kind',
        'question',
        'quote',
      ],
      'additionalProperties': false,
    },
    'value223': {
      'type': 'object',
      'properties': {
        'source': {
          '$ref': '#/$defs/value224',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'source',
        'text',
      ],
      'additionalProperties': false,
    },
    'value224': {
      'anyOf': [
        {
          'const': 'abstract',
        },
        {
          'const': 'title',
        },
      ],
    },
    'value225': {
      'type': 'object',
      'properties': {
        'kind': {
          '$ref': '#/$defs/value226',
        },
        'label': {
          'type': 'string',
        },
        'quote': {
          '$ref': '#/$defs/value223',
        },
      },
      'required': [
        'kind',
        'label',
        'quote',
      ],
      'additionalProperties': false,
    },
    'value226': {
      'anyOf': [
        {
          'const': 'method',
        },
        {
          'const': 'evidence_type',
        },
      ],
    },
    'value227': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'contribution',
        },
        'classification': {
          '$ref': '#/$defs/value228',
        },
        'quote': {
          '$ref': '#/$defs/value223',
        },
      },
      'required': [
        'kind',
        'classification',
        'quote',
      ],
      'additionalProperties': false,
    },
    'value228': {
      'anyOf': [
        {
          'const': 'core_method',
        },
        {
          'const': 'empirical_evaluation',
        },
        {
          'const': 'benchmark_or_dataset',
        },
        {
          'const': 'review',
        },
        {
          'const': 'application',
        },
        {
          'const': 'adjacent_technology',
        },
      ],
    },
    'value229': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value230',
      },
    },
    'value230': {
      'type': 'object',
      'properties': {
        'term': {
          'type': 'string',
        },
        'source': {
          '$ref': '#/$defs/value231',
        },
        'text': {
          'type': 'string',
        },
      },
      'required': [
        'term',
        'source',
        'text',
      ],
      'additionalProperties': false,
    },
    'value231': {
      'anyOf': [
        {
          'const': 'abstract',
        },
        {
          'const': 'title',
        },
        {
          'const': 'keywords',
        },
      ],
    },
    'value232': {
      'anyOf': [
        {
          '$ref': '#/$defs/value233',
        },
        {
          '$ref': '#/$defs/value234',
        },
        {
          '$ref': '#/$defs/value235',
        },
      ],
    },
    'value233': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'potentially_relevant',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value234': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'off_topic',
        },
        'reason': {
          'type': 'string',
        },
        'quote': {
          '$ref': '#/$defs/value223',
        },
      },
      'required': [
        'status',
        'reason',
        'quote',
      ],
      'additionalProperties': false,
    },
    'value235': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'unknown',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value236': {
      'anyOf': [
        {
          '$ref': '#/$defs/value237',
        },
        {
          '$ref': '#/$defs/value239',
        },
        {
          '$ref': '#/$defs/value240',
        },
        {
          '$ref': '#/$defs/value241',
        },
      ],
    },
    'value237': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'validated',
        },
        'scope': {
          '$ref': '#/$defs/value238',
        },
      },
      'required': [
        'status',
        'scope',
      ],
      'additionalProperties': false,
    },
    'value238': {
      'anyOf': [
        {
          'const': 'potentially_relevant',
        },
        {
          'const': 'off_topic',
        },
      ],
    },
    'value239': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'unknown',
        },
      },
      'required': [
        'status',
      ],
      'additionalProperties': false,
    },
    'value240': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'failed',
        },
        'code': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'code',
      ],
      'additionalProperties': false,
    },
    'value241': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'not_selected',
        },
        'reason': {
          '$ref': '#/$defs/value242',
        },
      },
      'required': [
        'status',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value242': {
      'anyOf': [
        {
          'const': 'not_selected_budget',
        },
        {
          'const': 'hard_excluded',
        },
        {
          'const': 'fulltext_unresolvable',
        },
        {
          'const': 'cancelled_before_dispatch',
        },
      ],
    },
    'value243': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value228',
      },
    },
    'value244': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value245',
      },
    },
    'value245': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': false,
        },
        {
          'const': true,
        },
      ],
    },
    'value246': {
      'type': 'array',
      'items': {
        'type': 'string',
      },
      'minItems': 1,
    },
    'value247': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'evaluations': {
          '$ref': '#/$defs/value248',
        },
        'queues': {
          '$ref': '#/$defs/value261',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'researchBriefVersion',
        'evaluations',
        'queues',
        'limitations',
      ],
      'additionalProperties': false,
    },
    'value248': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value249',
      },
    },
    'value249': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'discoveredBy': {
          '$ref': '#/$defs/value250',
        },
        'classification': {
          '$ref': '#/$defs/value251',
        },
        'hardFilter': {
          '$ref': '#/$defs/value252',
        },
        'score': {
          '$ref': '#/$defs/value259',
        },
        'priority': {
          '$ref': '#/$defs/value260',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value46',
        },
        'fulltextAvailability': {
          '$ref': '#/$defs/value215',
        },
        'diversityTags': {
          '$ref': '#/$defs/value46',
        },
        'decisionReasons': {
          '$ref': '#/$defs/value246',
        },
      },
      'required': [
        'schemaVersion',
        'academicWorkId',
        'workVersionId',
        'discoveredBy',
        'classification',
        'hardFilter',
        'score',
        'priority',
        'matchedQuestions',
        'fulltextAvailability',
        'diversityTags',
        'decisionReasons',
      ],
      'additionalProperties': false,
    },
    'value250': {
      'type': 'array',
      'items': {
        'type': 'string',
        'minLength': 1,
      },
    },
    'value251': {
      'anyOf': [
        {
          'const': 'core_method',
        },
        {
          'const': 'empirical_evaluation',
        },
        {
          'const': 'benchmark_or_dataset',
        },
        {
          'const': 'review',
        },
        {
          'const': 'application',
        },
        {
          'const': 'adjacent_technology',
        },
        {
          'const': 'background',
        },
        {
          'const': 'irrelevant',
        },
      ],
    },
    'value252': {
      'anyOf': [
        {
          '$ref': '#/$defs/value253',
        },
        {
          '$ref': '#/$defs/value257',
        },
      ],
    },
    'value253': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'eligible',
        },
        'reasons': {
          '$ref': '#/$defs/value254',
        },
      },
      'required': [
        'status',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value254': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value255',
      },
    },
    'value255': {
      'type': 'object',
      'properties': {
        'code': {
          '$ref': '#/$defs/value256',
        },
        'detail': {
          'type': 'string',
        },
      },
      'required': [
        'code',
      ],
      'additionalProperties': false,
    },
    'value256': {
      'anyOf': [
        {
          'const': 'off_topic',
        },
        {
          'const': 'work_retracted',
        },
        {
          'const': 'version_retracted',
        },
        {
          'const': 'preprint_not_allowed',
        },
        {
          'const': 'work_type_not_included',
        },
        {
          'const': 'before_publication_window',
        },
        {
          'const': 'after_publication_window',
        },
        {
          'const': 'publication_date_unknown',
        },
        {
          'const': 'required_term_missing',
        },
        {
          'const': 'excluded_term_matched',
        },
        {
          'const': 'inclusion_rule_not_met',
        },
        {
          'const': 'exclusion_rule_matched',
        },
      ],
    },
    'value257': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'excluded',
        },
        'reasons': {
          '$ref': '#/$defs/value258',
        },
      },
      'required': [
        'status',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value258': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value255',
      },
      'minItems': 1,
    },
    'value259': {
      'type': 'object',
      'properties': {
        'total': {
          'type': 'number',
        },
        'topicRelevance': {
          'type': 'number',
        },
        'questionMatch': {
          'type': 'number',
        },
        'evidencePotential': {
          'type': 'number',
        },
        'methodMatch': {
          'type': 'number',
        },
        'workTypeFit': {
          'type': 'number',
        },
        'sourceQuality': {
          'type': 'number',
        },
        'recency': {
          'type': 'number',
        },
        'fulltextAvailability': {
          'type': 'number',
        },
      },
      'required': [
        'total',
        'topicRelevance',
        'questionMatch',
        'evidencePotential',
        'methodMatch',
        'workTypeFit',
        'sourceQuality',
        'recency',
        'fulltextAvailability',
      ],
      'additionalProperties': false,
    },
    'value260': {
      'anyOf': [
        {
          'const': 'excluded',
        },
        {
          'const': 'p0',
        },
        {
          'const': 'p1',
        },
        {
          'const': 'p2',
        },
      ],
    },
    'value261': {
      'type': 'object',
      'properties': {
        'p0': {
          '$ref': '#/$defs/value152',
        },
        'p1': {
          '$ref': '#/$defs/value152',
        },
        'p2': {
          '$ref': '#/$defs/value152',
        },
        'excluded': {
          '$ref': '#/$defs/value152',
        },
      },
      'required': [
        'p0',
        'p1',
        'p2',
        'excluded',
      ],
      'additionalProperties': false,
    },
    'value262': {
      'type': 'object',
      'properties': {
        'initialBatchSize': {
          'type': 'number',
        },
        'evidenceGapBatchSize': {
          'type': 'number',
        },
        'replenishmentBatchSize': {
          'type': 'number',
        },
        'minimumQuestionSupportingWorks': {
          'type': 'number',
        },
      },
      'required': [
        'initialBatchSize',
        'evidenceGapBatchSize',
        'replenishmentBatchSize',
        'minimumQuestionSupportingWorks',
      ],
      'additionalProperties': false,
    },
    'value263': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value264',
      },
    },
    'value264': {
      'type': 'object',
      'properties': {
        'roundIndex': {
          'type': 'number',
        },
        'purpose': {
          '$ref': '#/$defs/value205',
        },
        'searchQueryIds': {
          '$ref': '#/$defs/value250',
        },
        'status': {
          '$ref': '#/$defs/value265',
        },
        'startedAt': {
          '$ref': '#/$defs/value74',
        },
        'completedAt': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'roundIndex',
        'purpose',
        'searchQueryIds',
        'status',
        'startedAt',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value265': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'planned',
        },
        {
          'const': 'running',
        },
        {
          'const': 'success',
        },
        {
          'const': 'partial_success',
        },
      ],
    },
    'value266': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value180',
      },
    },
    'value267': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value182',
      },
    },
    'value268': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value183',
        },
      ],
    },
    'value269': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value270',
      },
    },
    'value270': {
      'anyOf': [
        {
          '$ref': '#/$defs/value271',
        },
        {
          '$ref': '#/$defs/value274',
        },
        {
          '$ref': '#/$defs/value276',
        },
        {
          '$ref': '#/$defs/value277',
        },
        {
          '$ref': '#/$defs/value278',
        },
      ],
    },
    'value271': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'paused',
        },
        'pause': {
          '$ref': '#/$defs/value272',
        },
      },
      'required': [
        'status',
        'pause',
      ],
      'additionalProperties': false,
    },
    'value272': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'oldHash': {
          '$ref': '#/$defs/value84',
        },
        'newHash': {
          'type': 'string',
        },
        'sourceUrl': {
          'type': 'string',
        },
        'retrievedAt': {
          'type': 'string',
        },
        'reason': {
          '$ref': '#/$defs/value273',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'oldHash',
        'newHash',
        'sourceUrl',
        'retrievedAt',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value273': {
      'anyOf': [
        {
          'const': 'identity_mismatch',
        },
        {
          'const': 'empty_hash',
        },
        {
          'const': 'hash_conflict',
        },
        {
          'const': 'history_requires_review',
        },
        {
          'const': 'hash_unavailable',
        },
        {
          'const': 'input_too_large',
        },
        {
          'const': 'scope_needs_more_context',
        },
      ],
    },
    'value274': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'excluded',
        },
        'exclusion': {
          '$ref': '#/$defs/value275',
        },
      },
      'required': [
        'status',
        'exclusion',
      ],
      'additionalProperties': false,
    },
    'value275': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'sourceUrl': {
          'type': 'string',
        },
        'retrievedAt': {
          'type': 'string',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'sourceUrl',
        'retrievedAt',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value276': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'extracted',
        },
        'version': {
          '$ref': '#/$defs/value159',
        },
        'evidence': {
          '$ref': '#/$defs/value70',
        },
      },
      'required': [
        'status',
        'version',
        'evidence',
      ],
      'additionalProperties': false,
    },
    'value277': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'partially_extracted',
        },
        'version': {
          '$ref': '#/$defs/value159',
        },
        'evidence': {
          '$ref': '#/$defs/value70',
        },
      },
      'required': [
        'status',
        'version',
        'evidence',
      ],
      'additionalProperties': false,
    },
    'value278': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'extraction_failed',
        },
        'version': {
          '$ref': '#/$defs/value159',
        },
        'evidence': {
          '$ref': '#/$defs/value70',
        },
      },
      'required': [
        'status',
        'version',
        'evidence',
      ],
      'additionalProperties': false,
    },
    'value279': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value280',
      },
    },
    'value280': {
      'type': 'object',
      'properties': {
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'stage': {
          '$ref': '#/$defs/value281',
        },
      },
      'required': [
        'workVersionId',
        'stage',
      ],
      'additionalProperties': false,
    },
    'value281': {
      'anyOf': [
        {
          'const': 'extraction',
        },
        {
          'const': 'fulltext',
        },
      ],
    },
    'value282': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'selectedAt': {
          'type': 'string',
        },
      },
      'required': [
        'schemaVersion',
        'retrievalRunId',
        'workVersionId',
        'selectedAt',
      ],
      'additionalProperties': false,
    },
    'value283': {
      'type': 'object',
      'properties': {
        'status': {
          '$ref': '#/$defs/value284',
        },
        'completedAt': {
          'type': 'string',
        },
        'addedEvidenceRecords': {
          'type': 'number',
        },
        'incompleteFragments': {
          'type': 'number',
        },
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'selectedAt': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'completedAt',
        'addedEvidenceRecords',
        'incompleteFragments',
        'schemaVersion',
        'retrievalRunId',
        'workVersionId',
        'selectedAt',
      ],
      'additionalProperties': false,
    },
    'value284': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'completed',
        },
        {
          'const': 'partial_success',
        },
      ],
    },
    'value285': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'config': {
          '$ref': '#/$defs/value7',
        },
        'messages': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string',
                'minLength': 1,
              },
              'role': {
                'const': 'user',
              },
              'source': {
                'type': 'object',
                'properties': {
                  'kind': {
                    'const': 'plugin',
                  },
                  'plugin': {
                    'const': 'dsh-api-academic-research-controller',
                  },
                },
                'required': [
                  'kind',
                  'plugin',
                ],
                'additionalProperties': false,
              },
              'content': {
                'type': 'array',
                'items': {
                  'type': 'object',
                  'properties': {
                    'type': {
                      'const': 'text',
                    },
                    'text': {
                      'type': 'string',
                    },
                  },
                  'required': [
                    'type',
                    'text',
                  ],
                  'additionalProperties': false,
                },
              },
            },
            'required': [
              'id',
              'role',
              'source',
              'content',
            ],
            'additionalProperties': false,
          },
        },
        'estimatedInputTokens': {
          'type': 'number',
        },
        'contextWindow': {
          'type': 'number',
        },
        'outputTokens': {
          'type': 'number',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'decision': {
          '$ref': '#/$defs/value37',
        },
      },
      'required': [
        'academicWorkId',
        'researchBriefId',
        'researchBriefVersion',
        'config',
        'messages',
        'estimatedInputTokens',
        'contextWindow',
        'outputTokens',
        'attempt',
        'maxAttempts',
        'decision',
      ],
      'additionalProperties': false,
    },
    'value286': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'usage': {
          '$ref': '#/$defs/value58',
        },
        'finish': {
          '$ref': '#/$defs/value60',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'status': {
          '$ref': '#/$defs/value40',
        },
        'requestSeq': {
          '$ref': '#/$defs/value39',
        },
        'elapsedMs': {
          'type': 'number',
        },
        'firstContentElapsedMs': {
          'type': 'number',
        },
        'failurePhase': {
          '$ref': '#/$defs/value41',
        },
        'stream': {
          '$ref': '#/$defs/value42',
        },
        'errorCode': {
          'type': 'string',
        },
      },
      'required': [
        'academicWorkId',
        'researchBriefId',
        'researchBriefVersion',
        'attempt',
        'maxAttempts',
        'status',
        'requestSeq',
        'stream',
      ],
      'additionalProperties': false,
    },
    'value287': {
      'type': 'object',
      'properties': {
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'roundIndex': {
          'type': 'number',
        },
        'selection': {
          '$ref': '#/$defs/value288',
        },
      },
      'required': [
        'researchBriefId',
        'researchBriefVersion',
        'roundIndex',
        'selection',
      ],
      'additionalProperties': false,
    },
    'value288': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'maximumModelReviews': {
          'type': 'number',
        },
        'attemptedBefore': {
          'type': 'number',
        },
        'remainingBudget': {
          'type': 'number',
        },
        'decisions': {
          '$ref': '#/$defs/value289',
        },
      },
      'required': [
        'schemaVersion',
        'maximumModelReviews',
        'attemptedBefore',
        'remainingBudget',
        'decisions',
      ],
      'additionalProperties': false,
    },
    'value289': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value290',
      },
    },
    'value290': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'routedQuestions': {
          '$ref': '#/$defs/value46',
        },
        'status': {
          '$ref': '#/$defs/value291',
        },
        'selectionOrder': {
          '$ref': '#/$defs/value79',
        },
        'selectionReason': {
          '$ref': '#/$defs/value292',
        },
      },
      'required': [
        'academicWorkId',
        'workVersionId',
        'routedQuestions',
        'status',
        'selectionOrder',
        'selectionReason',
      ],
      'additionalProperties': false,
    },
    'value291': {
      'anyOf': [
        {
          'const': 'not_selected_budget',
        },
        {
          'const': 'hard_excluded',
        },
        {
          'const': 'fulltext_unresolvable',
        },
        {
          'const': 'selected',
        },
        {
          'const': 'already_attempted',
        },
      ],
    },
    'value292': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': 'question_coverage',
        },
        {
          'const': 'lexical_fill',
        },
      ],
    },
    'value293': {
      'type': 'object',
      'properties': {
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'roundIndex': {
          'type': 'number',
        },
        'selectionSeq': {
          '$ref': '#/$defs/value39',
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'config': {
          '$ref': '#/$defs/value7',
        },
        'messages': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'id': {
                'type': 'string',
                'minLength': 1,
              },
              'role': {
                'const': 'user',
              },
              'source': {
                'type': 'object',
                'properties': {
                  'kind': {
                    'const': 'plugin',
                  },
                  'plugin': {
                    'const': 'dsh-api-academic-research-controller',
                  },
                },
                'required': [
                  'kind',
                  'plugin',
                ],
                'additionalProperties': false,
              },
              'content': {
                'type': 'array',
                'items': {
                  'type': 'object',
                  'properties': {
                    'type': {
                      'const': 'text',
                    },
                    'text': {
                      'type': 'string',
                    },
                  },
                  'required': [
                    'type',
                    'text',
                  ],
                  'additionalProperties': false,
                },
              },
            },
            'required': [
              'id',
              'role',
              'source',
              'content',
            ],
            'additionalProperties': false,
          },
        },
        'estimatedInputTokens': {
          'type': 'number',
        },
        'contextWindow': {
          'type': 'number',
        },
        'outputTokens': {
          'type': 'number',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'decision': {
          '$ref': '#/$defs/value37',
        },
      },
      'required': [
        'workVersionId',
        'roundIndex',
        'selectionSeq',
        'academicWorkId',
        'researchBriefId',
        'researchBriefVersion',
        'config',
        'messages',
        'estimatedInputTokens',
        'contextWindow',
        'outputTokens',
        'attempt',
        'maxAttempts',
        'decision',
      ],
      'additionalProperties': false,
    },
    'value294': {
      'type': 'object',
      'properties': {
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'roundIndex': {
          'type': 'number',
        },
        'selectionSeq': {
          '$ref': '#/$defs/value39',
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'usage': {
          '$ref': '#/$defs/value58',
        },
        'finish': {
          '$ref': '#/$defs/value60',
        },
        'phase': {
          '$ref': '#/$defs/value3',
        },
        'fragment': {
          '$ref': '#/$defs/value4',
        },
        'attempt': {
          'type': 'number',
        },
        'maxAttempts': {
          'type': 'number',
        },
        'status': {
          '$ref': '#/$defs/value40',
        },
        'requestSeq': {
          '$ref': '#/$defs/value39',
        },
        'elapsedMs': {
          'type': 'number',
        },
        'firstContentElapsedMs': {
          'type': 'number',
        },
        'failurePhase': {
          '$ref': '#/$defs/value41',
        },
        'stream': {
          '$ref': '#/$defs/value42',
        },
        'errorCode': {
          'type': 'string',
        },
      },
      'required': [
        'workVersionId',
        'roundIndex',
        'selectionSeq',
        'academicWorkId',
        'researchBriefId',
        'researchBriefVersion',
        'attempt',
        'maxAttempts',
        'status',
        'requestSeq',
        'stream',
      ],
      'additionalProperties': false,
    },
    'value295': {
      'type': 'object',
      'properties': {
        'requestSeq': {
          'type': 'integer',
          'minimum': 0,
        },
        'review': {
          '$ref': '#/$defs/value296',
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'roundIndex': {
          'type': 'number',
        },
        'selectionSeq': {
          '$ref': '#/$defs/value39',
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
      },
      'required': [
        'requestSeq',
        'review',
        'workVersionId',
        'roundIndex',
        'selectionSeq',
        'academicWorkId',
        'researchBriefId',
        'researchBriefVersion',
      ],
      'additionalProperties': false,
    },
    'value296': {
      'anyOf': [
        {
          '$ref': '#/$defs/value297',
        },
        {
          '$ref': '#/$defs/value300',
        },
      ],
    },
    'value297': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'scope': {
          '$ref': '#/$defs/value233',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value298',
        },
      },
      'required': [
        'schemaVersion',
        'scope',
        'matchedQuestions',
      ],
      'additionalProperties': false,
    },
    'value298': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value299',
      },
      'minItems': 1,
    },
    'value299': {
      'type': 'object',
      'properties': {
        'question': {
          'type': 'string',
        },
        'quote': {
          '$ref': '#/$defs/value223',
        },
      },
      'required': [
        'question',
        'quote',
      ],
      'additionalProperties': false,
    },
    'value300': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'scope': {
          '$ref': '#/$defs/value301',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value302',
        },
      },
      'required': [
        'schemaVersion',
        'scope',
        'matchedQuestions',
      ],
      'additionalProperties': false,
    },
    'value301': {
      'anyOf': [
        {
          '$ref': '#/$defs/value234',
        },
        {
          '$ref': '#/$defs/value235',
        },
      ],
    },
    'value302': {
      'type': 'array',
      'items': false,
      'minItems': 0,
      'maxItems': 0,
    },
    'value303': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'state': {
          '$ref': '#/$defs/value304',
        },
        'startedAt': {
          'type': 'string',
        },
        'updatedAt': {
          'type': 'string',
        },
        'retrievalRunId': {
          '$ref': '#/$defs/value305',
        },
        'progress': {
          '$ref': '#/$defs/value306',
        },
        'q6': {
          '$ref': '#/$defs/value336',
        },
        'result': {
          '$ref': '#/$defs/value370',
        },
        'error': {
          '$ref': '#/$defs/value74',
        },
        'cancelReason': {
          '$ref': '#/$defs/value424',
        },
        'sessionId': {
          'type': 'string',
          'minLength': 1,
        },
        'backgroundRunId': {
          'type': 'string',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'state',
        'startedAt',
        'updatedAt',
        'retrievalRunId',
        'progress',
        'q6',
        'result',
        'error',
        'cancelReason',
        'sessionId',
        'backgroundRunId',
      ],
      'additionalProperties': false,
    },
    'value304': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'completed',
        },
        {
          'const': 'running',
        },
        {
          'const': 'interrupted',
        },
      ],
    },
    'value305': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'string',
          'minLength': 1,
        },
      ],
    },
    'value306': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value307',
        },
      ],
    },
    'value307': {
      'type': 'object',
      'properties': {
        'sessionId': {
          'type': 'string',
          'minLength': 1,
        },
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'sequence': {
          'type': 'number',
        },
        'startedAt': {
          'type': 'string',
        },
        'updatedAt': {
          'type': 'string',
        },
        'elapsedMs': {
          'type': 'number',
        },
        'primaryStage': {
          '$ref': '#/$defs/value308',
        },
        'activeStages': {
          '$ref': '#/$defs/value309',
        },
        'stages': {
          '$ref': '#/$defs/value311',
        },
        'counts': {
          '$ref': '#/$defs/value315',
        },
        'activities': {
          '$ref': '#/$defs/value316',
        },
        'latestEvent': {
          '$ref': '#/$defs/value333',
        },
      },
      'required': [
        'sessionId',
        'schemaVersion',
        'retrievalRunId',
        'sequence',
        'startedAt',
        'updatedAt',
        'elapsedMs',
        'primaryStage',
        'activeStages',
        'stages',
        'counts',
        'activities',
        'latestEvent',
      ],
      'additionalProperties': false,
    },
    'value308': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': 'extraction',
        },
        {
          'const': 'fulltext',
        },
        {
          'const': 'analysis',
        },
        {
          'const': 'retrieval',
        },
        {
          'const': 'screening',
        },
        {
          'const': 'report',
        },
      ],
    },
    'value309': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value310',
      },
    },
    'value310': {
      'anyOf': [
        {
          'const': 'extraction',
        },
        {
          'const': 'fulltext',
        },
        {
          'const': 'analysis',
        },
        {
          'const': 'retrieval',
        },
        {
          'const': 'screening',
        },
        {
          'const': 'report',
        },
      ],
    },
    'value311': {
      'type': 'object',
      'properties': {
        'retrieval': {
          '$ref': '#/$defs/value312',
        },
        'screening': {
          '$ref': '#/$defs/value312',
        },
        'fulltext': {
          '$ref': '#/$defs/value312',
        },
        'extraction': {
          '$ref': '#/$defs/value312',
        },
        'analysis': {
          '$ref': '#/$defs/value312',
        },
        'report': {
          '$ref': '#/$defs/value312',
        },
      },
      'required': [
        'retrieval',
        'screening',
        'fulltext',
        'extraction',
        'analysis',
        'report',
      ],
      'additionalProperties': false,
    },
    'value312': {
      'type': 'object',
      'properties': {
        'status': {
          '$ref': '#/$defs/value313',
        },
        'startedAt': {
          '$ref': '#/$defs/value74',
        },
        'completedAt': {
          '$ref': '#/$defs/value74',
        },
        'completedItems': {
          'type': 'number',
        },
        'totalItems': {
          '$ref': '#/$defs/value79',
        },
        'unit': {
          '$ref': '#/$defs/value314',
        },
      },
      'required': [
        'status',
        'startedAt',
        'completedAt',
        'completedItems',
        'totalItems',
        'unit',
      ],
      'additionalProperties': false,
    },
    'value313': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'pending',
        },
        {
          'const': 'running',
        },
        {
          'const': 'success',
        },
        {
          'const': 'partial_success',
        },
        {
          'const': 'not_run',
        },
      ],
    },
    'value314': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': 'report',
        },
        {
          'const': 'queries',
        },
        {
          'const': 'works',
        },
        {
          'const': 'papers',
        },
        {
          'const': 'batches',
        },
        {
          'const': 'questions',
        },
      ],
    },
    'value315': {
      'type': 'object',
      'properties': {
        'completedQueries': {
          'type': 'number',
        },
        'totalQueries': {
          'type': 'number',
        },
        'discoveredRecords': {
          'type': 'number',
        },
        'deduplicatedWorks': {
          'type': 'number',
        },
        'mergedWorkIdentities': {
          'type': 'number',
        },
        'mergedVersionRecords': {
          'type': 'number',
        },
        'retainedWorkVersions': {
          'type': 'number',
        },
        'suspectedDuplicateRecords': {
          'type': 'number',
        },
        'candidateWorks': {
          'type': 'number',
        },
        'completedPapers': {
          'type': 'number',
        },
        'totalPapers': {
          '$ref': '#/$defs/value79',
        },
        'includedPapers': {
          'type': 'number',
        },
        'availableFulltextPapers': {
          'type': 'number',
        },
        'validatedEvidenceRecords': {
          'type': 'number',
        },
        'rejectedEvidenceDrafts': {
          'type': 'number',
        },
        'completedQuestions': {
          'type': 'number',
        },
        'totalQuestions': {
          'type': 'number',
        },
      },
      'required': [
        'completedQueries',
        'totalQueries',
        'discoveredRecords',
        'deduplicatedWorks',
        'mergedWorkIdentities',
        'mergedVersionRecords',
        'retainedWorkVersions',
        'suspectedDuplicateRecords',
        'candidateWorks',
        'completedPapers',
        'totalPapers',
        'includedPapers',
        'availableFulltextPapers',
        'validatedEvidenceRecords',
        'rejectedEvidenceDrafts',
        'completedQuestions',
        'totalQuestions',
      ],
      'additionalProperties': false,
    },
    'value316': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value317',
      },
    },
    'value317': {
      'anyOf': [
        {
          '$ref': '#/$defs/value318',
        },
        {
          '$ref': '#/$defs/value321',
        },
        {
          '$ref': '#/$defs/value325',
        },
        {
          '$ref': '#/$defs/value327',
        },
        {
          '$ref': '#/$defs/value328',
        },
        {
          '$ref': '#/$defs/value330',
        },
        {
          '$ref': '#/$defs/value331',
        },
      ],
    },
    'value318': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'query',
        },
        'stage': {
          'const': 'retrieval',
        },
        'queryIndex': {
          'type': 'number',
        },
        'queryCount': {
          'type': 'number',
        },
        'query': {
          'type': 'string',
        },
        'channels': {
          '$ref': '#/$defs/value319',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'queryIndex',
        'queryCount',
        'query',
        'channels',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value319': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value320',
      },
    },
    'value320': {
      'anyOf': [
        {
          'const': 'academic',
        },
        {
          'const': 'web_discovery',
        },
      ],
    },
    'value321': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'provider',
        },
        'stage': {
          'const': 'retrieval',
        },
        'queryIndex': {
          'type': 'number',
        },
        'queryCount': {
          'type': 'number',
        },
        'providerId': {
          'type': 'string',
        },
        'operation': {
          '$ref': '#/$defs/value322',
        },
        'status': {
          '$ref': '#/$defs/value323',
        },
        'itemIndex': {
          '$ref': '#/$defs/value79',
        },
        'itemCount': {
          '$ref': '#/$defs/value79',
        },
        'discoveredRecords': {
          '$ref': '#/$defs/value79',
        },
        'failureCode': {
          '$ref': '#/$defs/value324',
        },
        'startedAt': {
          'type': 'string',
        },
        'completedAt': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'stage',
        'queryIndex',
        'queryCount',
        'providerId',
        'operation',
        'status',
        'itemIndex',
        'itemCount',
        'discoveredRecords',
        'failureCode',
        'startedAt',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value322': {
      'anyOf': [
        {
          'const': 'web_discovery',
        },
        {
          'const': 'academic_search',
        },
        {
          'const': 'reference_identification',
        },
        {
          'const': 'reference_verification',
        },
      ],
    },
    'value323': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'running',
        },
        {
          'const': 'success',
        },
        {
          'const': 'partial_success',
        },
      ],
    },
    'value324': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'unknown',
        },
        {
          'const': 'invalid_request',
        },
        {
          'const': 'authentication_failed',
        },
        {
          'const': 'rate_limited',
        },
        {
          'const': 'timeout',
        },
        {
          'const': 'network_error',
        },
        {
          'const': 'upstream_error',
        },
        {
          'const': 'not_found',
        },
        {
          'const': 'parse_failed',
        },
        {
          'const': 'fulltext_unavailable',
        },
        {
          'const': 'incomplete_output',
        },
        {
          'const': 'output_limit',
        },
        {
          'const': 'invalid_output',
        },
      ],
    },
    'value325': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'screening',
        },
        'stage': {
          'const': 'screening',
        },
        'operation': {
          '$ref': '#/$defs/value326',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'operation',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value326': {
      'anyOf': [
        {
          'const': 'deduplication',
        },
        {
          'const': 'eligibility',
        },
      ],
    },
    'value327': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'screening',
        },
        'stage': {
          'const': 'screening',
        },
        'operation': {
          'const': 'candidate_review',
        },
        'completedReviews': {
          'type': 'number',
        },
        'totalReviews': {
          'type': 'number',
        },
        'failedReviews': {
          'type': 'number',
        },
        'skippedReviews': {
          'type': 'number',
        },
        'title': {
          '$ref': '#/$defs/value74',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'operation',
        'completedReviews',
        'totalReviews',
        'failedReviews',
        'skippedReviews',
        'title',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value328': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'paper',
        },
        'stage': {
          '$ref': '#/$defs/value281',
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'title': {
          '$ref': '#/$defs/value74',
        },
        'operation': {
          '$ref': '#/$defs/value329',
        },
        'batchIndex': {
          '$ref': '#/$defs/value79',
        },
        'batchCount': {
          '$ref': '#/$defs/value79',
        },
        'attempt': {
          '$ref': '#/$defs/value79',
        },
        'maximumAttempts': {
          '$ref': '#/$defs/value79',
        },
        'lastFailure': {
          '$ref': '#/$defs/value324',
        },
        'validatedEvidenceRecords': {
          'type': 'number',
        },
        'rejectedEvidenceDrafts': {
          'type': 'number',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'academicWorkId',
        'workVersionId',
        'title',
        'operation',
        'batchIndex',
        'batchCount',
        'attempt',
        'maximumAttempts',
        'lastFailure',
        'validatedEvidenceRecords',
        'rejectedEvidenceDrafts',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value329': {
      'anyOf': [
        {
          'const': 'fulltext_fetch',
        },
        {
          'const': 'fulltext_parse',
        },
        {
          'const': 'evidence_extract',
        },
        {
          'const': 'evidence_validate',
        },
        {
          'const': 'waiting_retry',
        },
      ],
    },
    'value330': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'question',
        },
        'stage': {
          'const': 'analysis',
        },
        'questionIndex': {
          'type': 'number',
        },
        'questionCount': {
          'type': 'number',
        },
        'question': {
          'type': 'string',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'questionIndex',
        'questionCount',
        'question',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value331': {
      'type': 'object',
      'properties': {
        'kind': {
          'const': 'report',
        },
        'stage': {
          'const': 'report',
        },
        'operation': {
          '$ref': '#/$defs/value332',
        },
        'attempt': {
          '$ref': '#/$defs/value79',
        },
        'maximumAttempts': {
          '$ref': '#/$defs/value79',
        },
        'lastFailure': {
          '$ref': '#/$defs/value324',
        },
        'startedAt': {
          'type': 'string',
        },
      },
      'required': [
        'kind',
        'stage',
        'operation',
        'attempt',
        'maximumAttempts',
        'lastFailure',
        'startedAt',
      ],
      'additionalProperties': false,
    },
    'value332': {
      'anyOf': [
        {
          'const': 'evaluation',
        },
        {
          'const': 'rendering',
        },
      ],
    },
    'value333': {
      'type': 'object',
      'properties': {
        'code': {
          '$ref': '#/$defs/value334',
        },
        'occurredAt': {
          'type': 'string',
        },
        'stage': {
          '$ref': '#/$defs/value310',
        },
        'academicWorkId': {
          '$ref': '#/$defs/value335',
        },
        'workVersionId': {
          '$ref': '#/$defs/value163',
        },
        'providerId': {
          '$ref': '#/$defs/value74',
        },
        'failureCode': {
          '$ref': '#/$defs/value324',
        },
      },
      'required': [
        'code',
        'occurredAt',
        'stage',
        'academicWorkId',
        'workVersionId',
        'providerId',
        'failureCode',
      ],
      'additionalProperties': false,
    },
    'value334': {
      'anyOf': [
        {
          'const': 'run_started',
        },
        {
          'const': 'stage_started',
        },
        {
          'const': 'stage_updated',
        },
        {
          'const': 'stage_settled',
        },
        {
          'const': 'provider_updated',
        },
        {
          'const': 'paper_updated',
        },
        {
          'const': 'retry_scheduled',
        },
        {
          'const': 'run_completed',
        },
        {
          'const': 'run_cancelled',
        },
      ],
    },
    'value335': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'string',
          'minLength': 1,
        },
      ],
    },
    'value336': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value337',
        },
      ],
    },
    'value337': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'sessionId': {
          'type': 'string',
          'minLength': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'sequence': {
          'type': 'number',
        },
        'updatedAt': {
          'type': 'string',
        },
        'status': {
          '$ref': '#/$defs/value338',
        },
        'plan': {
          '$ref': '#/$defs/value196',
        },
        'candidates': {
          '$ref': '#/$defs/value339',
        },
        'rounds': {
          '$ref': '#/$defs/value353',
        },
        'batches': {
          '$ref': '#/$defs/value356',
        },
        'coverage': {
          '$ref': '#/$defs/value360',
        },
        'stopDecision': {
          '$ref': '#/$defs/value363',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'sessionId',
        'retrievalRunId',
        'researchBriefId',
        'researchBriefVersion',
        'sequence',
        'updatedAt',
        'status',
        'plan',
        'candidates',
        'rounds',
        'batches',
        'coverage',
        'stopDecision',
        'limitations',
      ],
      'additionalProperties': false,
    },
    'value338': {
      'anyOf': [
        {
          'const': 'cancelled',
        },
        {
          'const': 'running',
        },
        {
          'const': 'settled',
        },
      ],
    },
    'value339': {
      'anyOf': [
        {
          '$ref': '#/$defs/value340',
        },
        {
          '$ref': '#/$defs/value341',
        },
        {
          '$ref': '#/$defs/value342',
        },
        {
          '$ref': '#/$defs/value352',
        },
      ],
    },
    'value340': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'pending',
        },
      },
      'required': [
        'state',
      ],
      'additionalProperties': false,
    },
    'value341': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'failed',
        },
        'code': {
          'type': 'string',
        },
        'message': {
          'type': 'string',
        },
        'retryable': {
          'type': 'boolean',
        },
      },
      'required': [
        'state',
        'code',
        'message',
        'retryable',
      ],
      'additionalProperties': false,
    },
    'value342': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value343',
        },
      },
      'required': [
        'state',
        'value',
      ],
      'additionalProperties': false,
    },
    'value343': {
      'type': 'object',
      'properties': {
        'items': {
          '$ref': '#/$defs/value344',
        },
        'ranking': {
          '$ref': '#/$defs/value351',
        },
      },
      'required': [
        'items',
        'ranking',
      ],
      'additionalProperties': false,
    },
    'value344': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value345',
      },
    },
    'value345': {
      'type': 'object',
      'properties': {
        'work': {
          '$ref': '#/$defs/value148',
        },
        'version': {
          '$ref': '#/$defs/value159',
        },
        'assessment': {
          '$ref': '#/$defs/value346',
        },
        'evaluation': {
          '$ref': '#/$defs/value347',
        },
      },
      'required': [
        'work',
        'version',
        'assessment',
        'evaluation',
      ],
      'additionalProperties': false,
    },
    'value346': {
      'type': 'object',
      'properties': {
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'abstract': {
          '$ref': '#/$defs/value84',
        },
        'keywords': {
          '$ref': '#/$defs/value213',
        },
        'fulltextAvailability': {
          '$ref': '#/$defs/value215',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value46',
        },
        'screening': {
          '$ref': '#/$defs/value219',
        },
        'semanticReview': {
          '$ref': '#/$defs/value236',
        },
        'contributionSignals': {
          '$ref': '#/$defs/value243',
        },
        'topicRelevance': {
          'type': 'number',
        },
        'evidencePotential': {
          'type': 'number',
        },
        'methodMatch': {
          'type': 'number',
        },
        'sourceQuality': {
          'type': 'number',
        },
        'recency': {
          'type': 'number',
        },
        'inclusionRuleMatches': {
          '$ref': '#/$defs/value244',
        },
        'exclusionRuleMatches': {
          '$ref': '#/$defs/value244',
        },
        'diversityTags': {
          '$ref': '#/$defs/value46',
        },
        'reasons': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'academicWorkId',
        'abstract',
        'keywords',
        'fulltextAvailability',
        'matchedQuestions',
        'contributionSignals',
        'topicRelevance',
        'evidencePotential',
        'methodMatch',
        'sourceQuality',
        'recency',
        'inclusionRuleMatches',
        'exclusionRuleMatches',
        'diversityTags',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value347': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'discoveredBy': {
          '$ref': '#/$defs/value250',
        },
        'classification': {
          '$ref': '#/$defs/value251',
        },
        'hardFilter': {
          '$ref': '#/$defs/value348',
        },
        'score': {
          '$ref': '#/$defs/value259',
        },
        'priority': {
          '$ref': '#/$defs/value260',
        },
        'matchedQuestions': {
          '$ref': '#/$defs/value46',
        },
        'fulltextAvailability': {
          '$ref': '#/$defs/value215',
        },
        'diversityTags': {
          '$ref': '#/$defs/value46',
        },
        'decisionReasons': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'academicWorkId',
        'workVersionId',
        'discoveredBy',
        'classification',
        'hardFilter',
        'score',
        'priority',
        'matchedQuestions',
        'fulltextAvailability',
        'diversityTags',
        'decisionReasons',
      ],
      'additionalProperties': false,
    },
    'value348': {
      'anyOf': [
        {
          '$ref': '#/$defs/value349',
        },
        {
          '$ref': '#/$defs/value350',
        },
      ],
    },
    'value349': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'eligible',
        },
        'reasons': {
          '$ref': '#/$defs/value254',
        },
      },
      'required': [
        'status',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value350': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'excluded',
        },
        'reasons': {
          '$ref': '#/$defs/value254',
        },
      },
      'required': [
        'status',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value351': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'queues': {
          '$ref': '#/$defs/value261',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'researchBriefId',
        'researchBriefVersion',
        'queues',
        'limitations',
      ],
      'additionalProperties': false,
    },
    'value352': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'truncated',
        },
        'value': {
          '$ref': '#/$defs/value343',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'state',
        'value',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value353': {
      'anyOf': [
        {
          '$ref': '#/$defs/value340',
        },
        {
          '$ref': '#/$defs/value341',
        },
        {
          '$ref': '#/$defs/value354',
        },
        {
          '$ref': '#/$defs/value355',
        },
      ],
    },
    'value354': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value263',
        },
      },
      'required': [
        'state',
        'value',
      ],
      'additionalProperties': false,
    },
    'value355': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'truncated',
        },
        'value': {
          '$ref': '#/$defs/value263',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'state',
        'value',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value356': {
      'anyOf': [
        {
          '$ref': '#/$defs/value340',
        },
        {
          '$ref': '#/$defs/value341',
        },
        {
          '$ref': '#/$defs/value357',
        },
        {
          '$ref': '#/$defs/value359',
        },
      ],
    },
    'value357': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value358',
        },
      },
      'required': [
        'state',
        'value',
      ],
      'additionalProperties': false,
    },
    'value358': {
      'type': 'object',
      'properties': {
        'decisions': {
          '$ref': '#/$defs/value266',
        },
        'settlements': {
          '$ref': '#/$defs/value267',
        },
      },
      'required': [
        'decisions',
        'settlements',
      ],
      'additionalProperties': false,
    },
    'value359': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'truncated',
        },
        'value': {
          '$ref': '#/$defs/value358',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'state',
        'value',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value360': {
      'anyOf': [
        {
          '$ref': '#/$defs/value340',
        },
        {
          '$ref': '#/$defs/value341',
        },
        {
          '$ref': '#/$defs/value361',
        },
        {
          '$ref': '#/$defs/value362',
        },
      ],
    },
    'value361': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value183',
        },
      },
      'required': [
        'state',
        'value',
      ],
      'additionalProperties': false,
    },
    'value362': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'truncated',
        },
        'value': {
          '$ref': '#/$defs/value183',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'state',
        'value',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value363': {
      'anyOf': [
        {
          '$ref': '#/$defs/value340',
        },
        {
          '$ref': '#/$defs/value341',
        },
        {
          '$ref': '#/$defs/value364',
        },
        {
          '$ref': '#/$defs/value369',
        },
      ],
    },
    'value364': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'available',
        },
        'value': {
          '$ref': '#/$defs/value365',
        },
      },
      'required': [
        'state',
        'value',
      ],
      'additionalProperties': false,
    },
    'value365': {
      'anyOf': [
        {
          '$ref': '#/$defs/value366',
        },
        {
          '$ref': '#/$defs/value367',
        },
      ],
    },
    'value366': {
      'type': 'object',
      'properties': {
        'shouldStop': {
          'const': false,
        },
        'reason': {
          'type': 'null',
        },
        'details': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'shouldStop',
        'reason',
        'details',
      ],
      'additionalProperties': false,
    },
    'value367': {
      'type': 'object',
      'properties': {
        'shouldStop': {
          'const': true,
        },
        'reason': {
          '$ref': '#/$defs/value368',
        },
        'details': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'shouldStop',
        'reason',
        'details',
      ],
      'additionalProperties': false,
    },
    'value368': {
      'anyOf': [
        {
          'const': 'cancelled',
        },
        {
          'const': 'target_and_coverage_met',
        },
        {
          'const': 'saturated',
        },
        {
          'const': 'candidate_exhausted',
        },
        {
          'const': 'maximum_search_rounds',
        },
        {
          'const': 'maximum_candidate_works',
        },
        {
          'const': 'maximum_included_works',
        },
        {
          'const': 'maximum_elapsed_time',
        },
        {
          'const': 'review_required',
        },
      ],
    },
    'value369': {
      'type': 'object',
      'properties': {
        'state': {
          'const': 'truncated',
        },
        'value': {
          '$ref': '#/$defs/value365',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'state',
        'value',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value370': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value371',
        },
      ],
    },
    'value371': {
      'type': 'object',
      'properties': {
        'synthesis': {
          '$ref': '#/$defs/value372',
        },
        'sessionId': {
          'type': 'string',
          'minLength': 1,
        },
        'status': {
          '$ref': '#/$defs/value190',
        },
        'q6': {
          '$ref': '#/$defs/value336',
        },
        'stages': {
          '$ref': '#/$defs/value374',
        },
        'hybridRetrieval': {
          '$ref': '#/$defs/value376',
        },
        'retrievalRun': {
          '$ref': '#/$defs/value386',
        },
        'papers': {
          '$ref': '#/$defs/value392',
        },
        'failures': {
          '$ref': '#/$defs/value400',
        },
        'report': {
          '$ref': '#/$defs/value402',
        },
      },
      'required': [
        'synthesis',
        'sessionId',
        'status',
        'q6',
        'stages',
        'retrievalRun',
        'papers',
        'failures',
        'report',
      ],
      'additionalProperties': false,
    },
    'value372': {
      'type': 'object',
      'properties': {
        'status': {
          '$ref': '#/$defs/value373',
        },
        'reasons': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'status',
        'reasons',
      ],
      'additionalProperties': false,
    },
    'value373': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'completed',
        },
        {
          'const': 'partial_success',
        },
        {
          'const': 'not_run',
        },
        {
          'const': 'blocked',
        },
      ],
    },
    'value374': {
      'type': 'object',
      'properties': {
        'search': {
          '$ref': '#/$defs/value375',
        },
        'fulltext': {
          '$ref': '#/$defs/value375',
        },
        'extraction': {
          '$ref': '#/$defs/value375',
        },
      },
      'required': [
        'search',
        'fulltext',
        'extraction',
      ],
      'additionalProperties': false,
    },
    'value375': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'success',
        },
        {
          'const': 'partial_success',
        },
        {
          'const': 'not_run',
        },
      ],
    },
    'value376': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'stages': {
          '$ref': '#/$defs/value377',
        },
        'counts': {
          '$ref': '#/$defs/value378',
        },
        'webCandidates': {
          '$ref': '#/$defs/value379',
        },
        'references': {
          '$ref': '#/$defs/value382',
        },
      },
      'required': [
        'schemaVersion',
        'stages',
        'counts',
        'webCandidates',
        'references',
      ],
      'additionalProperties': false,
    },
    'value377': {
      'type': 'object',
      'properties': {
        'academicSearch': {
          '$ref': '#/$defs/value375',
        },
        'webDiscovery': {
          '$ref': '#/$defs/value375',
        },
        'referenceIdentification': {
          '$ref': '#/$defs/value375',
        },
        'referenceVerification': {
          '$ref': '#/$defs/value375',
        },
        'deduplication': {
          '$ref': '#/$defs/value375',
        },
      },
      'required': [
        'academicSearch',
        'webDiscovery',
        'referenceIdentification',
        'referenceVerification',
        'deduplication',
      ],
      'additionalProperties': false,
    },
    'value378': {
      'type': 'object',
      'properties': {
        'academicDiscoveredRecords': {
          'type': 'number',
        },
        'webDiscoveredUrls': {
          'type': 'number',
        },
        'identifiedReferences': {
          'type': 'number',
        },
        'attemptedVerifications': {
          'type': 'number',
        },
        'verifiedReferences': {
          'type': 'number',
        },
        'failedVerifications': {
          'type': 'number',
        },
        'discardedWebCandidates': {
          'type': 'number',
        },
        'mergedDuplicates': {
          'type': 'number',
        },
        'deduplicatedWorks': {
          'type': 'number',
        },
      },
      'required': [
        'academicDiscoveredRecords',
        'webDiscoveredUrls',
        'identifiedReferences',
        'attemptedVerifications',
        'verifiedReferences',
        'failedVerifications',
        'discardedWebCandidates',
        'mergedDuplicates',
        'deduplicatedWorks',
      ],
      'additionalProperties': false,
    },
    'value379': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value380',
      },
    },
    'value380': {
      'type': 'object',
      'properties': {
        'query': {
          'type': 'string',
        },
        'url': {
          'type': 'string',
        },
        'title': {
          '$ref': '#/$defs/value74',
        },
        'status': {
          '$ref': '#/$defs/value381',
        },
        'identifiedReferenceCount': {
          'type': 'number',
        },
        'message': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'url',
        'title',
        'status',
        'identifiedReferenceCount',
        'message',
      ],
      'additionalProperties': false,
    },
    'value381': {
      'anyOf': [
        {
          'const': 'discovered',
        },
        {
          'const': 'references_identified',
        },
        {
          'const': 'discarded_non_paper',
        },
      ],
    },
    'value382': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value383',
      },
    },
    'value383': {
      'type': 'object',
      'properties': {
        'query': {
          'type': 'string',
        },
        'kind': {
          '$ref': '#/$defs/value384',
        },
        'normalizedValue': {
          'type': 'string',
        },
        'discoveryUrl': {
          'type': 'string',
        },
        'verificationProvider': {
          '$ref': '#/$defs/value74',
        },
        'status': {
          '$ref': '#/$defs/value385',
        },
        'message': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'kind',
        'normalizedValue',
        'discoveryUrl',
        'verificationProvider',
        'status',
        'message',
      ],
      'additionalProperties': false,
    },
    'value384': {
      'anyOf': [
        {
          'const': 'doi',
        },
        {
          'const': 'arxiv',
        },
        {
          'const': 'acl',
        },
        {
          'const': 'pmlr',
        },
        {
          'const': 'cvf',
        },
      ],
    },
    'value385': {
      'anyOf': [
        {
          'const': 'identified',
        },
        {
          'const': 'verified',
        },
        {
          'const': 'verification_failed',
        },
        {
          'const': 'merged_duplicate',
        },
      ],
    },
    'value386': {
      'anyOf': [
        {
          '$ref': '#/$defs/value387',
        },
        {
          '$ref': '#/$defs/value389',
        },
      ],
    },
    'value387': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'startedAt': {
          'type': 'string',
        },
        'queries': {
          '$ref': '#/$defs/value46',
        },
        'providers': {
          '$ref': '#/$defs/value46',
        },
        'academicWorkIds': {
          '$ref': '#/$defs/value187',
        },
        'coverageSummary': {
          '$ref': '#/$defs/value168',
        },
        'failures': {
          '$ref': '#/$defs/value169',
        },
        'stage': {
          '$ref': '#/$defs/value388',
        },
        'status': {
          'type': 'null',
        },
        'completedAt': {
          'type': 'null',
        },
      },
      'required': [
        'schemaVersion',
        'retrievalRunId',
        'researchBriefId',
        'researchBriefVersion',
        'startedAt',
        'queries',
        'providers',
        'academicWorkIds',
        'coverageSummary',
        'failures',
        'stage',
        'status',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value388': {
      'anyOf': [
        {
          'const': 'running',
        },
        {
          'const': 'planning',
        },
        {
          'const': 'awaiting_approval',
        },
      ],
    },
    'value389': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'retrievalRunId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'startedAt': {
          'type': 'string',
        },
        'queries': {
          '$ref': '#/$defs/value46',
        },
        'providers': {
          '$ref': '#/$defs/value46',
        },
        'academicWorkIds': {
          '$ref': '#/$defs/value187',
        },
        'coverageSummary': {
          '$ref': '#/$defs/value168',
        },
        'failures': {
          '$ref': '#/$defs/value169',
        },
        'stage': {
          '$ref': '#/$defs/value390',
        },
        'status': {
          '$ref': '#/$defs/value391',
        },
        'completedAt': {
          'type': 'string',
        },
      },
      'required': [
        'schemaVersion',
        'retrievalRunId',
        'researchBriefId',
        'researchBriefVersion',
        'startedAt',
        'queries',
        'providers',
        'academicWorkIds',
        'coverageSummary',
        'failures',
        'stage',
        'status',
        'completedAt',
      ],
      'additionalProperties': false,
    },
    'value390': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'cancelled',
        },
        {
          'const': 'completed',
        },
      ],
    },
    'value391': {
      'anyOf': [
        {
          'const': 'failed',
        },
        {
          'const': 'success',
        },
        {
          'const': 'partial_success',
        },
      ],
    },
    'value392': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value393',
      },
    },
    'value393': {
      'anyOf': [
        {
          '$ref': '#/$defs/value394',
        },
        {
          '$ref': '#/$defs/value398',
        },
        {
          '$ref': '#/$defs/value399',
        },
      ],
    },
    'value394': {
      'type': 'object',
      'properties': {
        'status': {
          '$ref': '#/$defs/value395',
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'evidenceCount': {
          'type': 'number',
        },
        'rejectedDrafts': {
          '$ref': '#/$defs/value396',
        },
      },
      'required': [
        'status',
        'workVersionId',
        'evidenceCount',
        'rejectedDrafts',
      ],
      'additionalProperties': false,
    },
    'value395': {
      'anyOf': [
        {
          'const': 'extracted',
        },
        {
          'const': 'partially_extracted',
        },
        {
          'const': 'extraction_failed',
        },
      ],
    },
    'value396': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value397',
      },
    },
    'value397': {
      'type': 'object',
      'properties': {
        'draftIndex': {
          'type': 'number',
        },
        'segmentIndex': {
          'type': 'number',
        },
        'code': {
          '$ref': '#/$defs/value126',
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'draftIndex',
        'segmentIndex',
        'code',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value398': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'excluded',
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'workVersionId',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value399': {
      'type': 'object',
      'properties': {
        'status': {
          'const': 'paused',
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'reason': {
          'type': 'string',
        },
      },
      'required': [
        'status',
        'workVersionId',
        'reason',
      ],
      'additionalProperties': false,
    },
    'value400': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value401',
      },
    },
    'value401': {
      'type': 'object',
      'properties': {
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'stage': {
          '$ref': '#/$defs/value281',
        },
      },
      'required': [
        'workVersionId',
        'stage',
      ],
      'additionalProperties': false,
    },
    'value402': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          '$ref': '#/$defs/value403',
        },
      ],
    },
    'value403': {
      'type': 'object',
      'properties': {
        'retrievalDisclosureIncluded': {
          'const': true,
        },
        'title': {
          'type': 'string',
        },
        'mode': {
          '$ref': '#/$defs/value404',
        },
        'synthetic': {
          'type': 'boolean',
        },
        'markdown': {
          'type': 'string',
        },
        'evaluation': {
          '$ref': '#/$defs/value405',
        },
        'claims': {
          '$ref': '#/$defs/value413',
        },
        'evidence': {
          '$ref': '#/$defs/value421',
        },
        'limitations': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'title',
        'mode',
        'synthetic',
        'markdown',
        'evaluation',
        'claims',
        'evidence',
        'limitations',
      ],
      'additionalProperties': false,
    },
    'value404': {
      'anyOf': [
        {
          'const': 'draft',
        },
        {
          'const': 'final',
        },
      ],
    },
    'value405': {
      'type': 'object',
      'properties': {
        'status': {
          '$ref': '#/$defs/value406',
        },
        'assessments': {
          '$ref': '#/$defs/value407',
        },
        'issues': {
          '$ref': '#/$defs/value410',
        },
      },
      'required': [
        'status',
        'assessments',
        'issues',
      ],
      'additionalProperties': false,
    },
    'value406': {
      'anyOf': [
        {
          'const': 'blocked',
        },
        {
          'const': 'ready',
        },
        {
          'const': 'needs_review',
        },
      ],
    },
    'value407': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value408',
      },
    },
    'value408': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'claimAssessmentId': {
          'type': 'string',
          'minLength': 1,
        },
        'claimId': {
          'type': 'string',
          'minLength': 1,
        },
        'status': {
          '$ref': '#/$defs/value409',
        },
        'reason': {
          'type': 'string',
        },
        'method': {
          'type': 'string',
        },
        'methodVersion': {
          'type': 'string',
        },
        'assessedEvidenceIds': {
          '$ref': '#/$defs/value188',
        },
        'assessedAt': {
          'type': 'string',
        },
      },
      'required': [
        'schemaVersion',
        'claimAssessmentId',
        'claimId',
        'status',
        'reason',
        'method',
        'methodVersion',
        'assessedEvidenceIds',
        'assessedAt',
      ],
      'additionalProperties': false,
    },
    'value409': {
      'anyOf': [
        {
          'const': 'supported',
        },
        {
          'const': 'partially_supported',
        },
        {
          'const': 'contradicted',
        },
        {
          'const': 'unsupported',
        },
        {
          'const': 'insufficient',
        },
      ],
    },
    'value410': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value411',
      },
    },
    'value411': {
      'type': 'object',
      'properties': {
        'claimId': {
          '$ref': '#/$defs/value412',
        },
        'category': {
          'type': 'string',
          'enum': ['delivery', 'content'],
        },
        'code': {
          'type': 'string',
        },
        'message': {
          'type': 'string',
        },
      },
      'required': [
        'claimId',
        'code',
        'message',
      ],
      'additionalProperties': false,
    },
    'value412': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'type': 'string',
          'minLength': 1,
        },
      ],
    },
    'value413': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value414',
      },
    },
    'value414': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'claimId': {
          'type': 'string',
          'minLength': 1,
        },
        'text': {
          'type': 'string',
        },
        'category': {
          '$ref': '#/$defs/value415',
        },
        'scope': {
          'type': 'string',
        },
        'uncertainty': {
          '$ref': '#/$defs/value74',
        },
        'confidence': {
          '$ref': '#/$defs/value416',
        },
        'confidenceReasons': {
          '$ref': '#/$defs/value46',
        },
        'evidenceSnapshot': {
          '$ref': '#/$defs/value417',
        },
        'validity': {
          '$ref': '#/$defs/value420',
        },
      },
      'required': [
        'schemaVersion',
        'claimId',
        'text',
        'category',
        'scope',
        'uncertainty',
        'confidence',
        'confidenceReasons',
        'evidenceSnapshot',
        'validity',
      ],
      'additionalProperties': false,
    },
    'value415': {
      'anyOf': [
        {
          'const': 'consensus',
        },
        {
          'const': 'trend',
        },
        {
          'const': 'comparison',
        },
        {
          'const': 'disagreement',
        },
        {
          'const': 'research_gap',
        },
        {
          'const': 'limitation',
        },
      ],
    },
    'value416': {
      'anyOf': [
        {
          'const': 'insufficient',
        },
        {
          'const': 'high',
        },
        {
          'const': 'medium',
        },
        {
          'const': 'low',
        },
      ],
    },
    'value417': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'evidenceSnapshotId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefId': {
          'type': 'string',
          'minLength': 1,
        },
        'researchBriefVersion': {
          'type': 'number',
        },
        'evidenceItems': {
          '$ref': '#/$defs/value418',
        },
        'createdAt': {
          'type': 'string',
        },
      },
      'required': [
        'schemaVersion',
        'evidenceSnapshotId',
        'researchBriefId',
        'researchBriefVersion',
        'evidenceItems',
        'createdAt',
      ],
      'additionalProperties': false,
    },
    'value418': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value419',
      },
    },
    'value419': {
      'type': 'object',
      'properties': {
        'evidenceId': {
          'type': 'string',
          'minLength': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'contentHash': {
          '$ref': '#/$defs/value74',
        },
      },
      'required': [
        'evidenceId',
        'academicWorkId',
        'workVersionId',
        'contentHash',
      ],
      'additionalProperties': false,
    },
    'value420': {
      'anyOf': [
        {
          'const': 'current',
        },
        {
          'const': 'stale',
        },
      ],
    },
    'value421': {
      'type': 'array',
      'items': {
        '$ref': '#/$defs/value422',
      },
    },
    'value422': {
      'type': 'object',
      'properties': {
        'schemaVersion': {
          'const': 1,
        },
        'evidenceId': {
          'type': 'string',
          'minLength': 1,
        },
        'academicWorkId': {
          'type': 'string',
          'minLength': 1,
        },
        'workVersionId': {
          'type': 'string',
          'minLength': 1,
        },
        'level': {
          '$ref': '#/$defs/value423',
        },
        'verbatimExcerpt': {
          '$ref': '#/$defs/value84',
        },
        'sourcedStatement': {
          'type': 'string',
        },
        'sourceLocatorId': {
          'type': 'string',
          'minLength': 1,
        },
        'sourceProvider': {
          'type': 'string',
        },
        'sourceUrl': {
          'type': 'string',
        },
        'retrievedAt': {
          'type': 'string',
        },
        'contentHash': {
          '$ref': '#/$defs/value84',
        },
        'extractionMethod': {
          '$ref': '#/$defs/value2',
        },
        'qualityNotes': {
          '$ref': '#/$defs/value46',
        },
      },
      'required': [
        'schemaVersion',
        'evidenceId',
        'academicWorkId',
        'workVersionId',
        'level',
        'verbatimExcerpt',
        'sourcedStatement',
        'sourceLocatorId',
        'sourceProvider',
        'sourceUrl',
        'retrievedAt',
        'contentHash',
        'extractionMethod',
        'qualityNotes',
      ],
      'additionalProperties': false,
    },
    'value423': {
      'anyOf': [
        {
          'const': 'abstract',
        },
        {
          'const': 'metadata',
        },
        {
          'const': 'fulltext',
        },
      ],
    },
    'value424': {
      'anyOf': [
        {
          'type': 'null',
        },
        {
          'const': 'user_requested',
        },
        {
          'const': 'service_stopped',
        },
      ],
    },
  },
}
