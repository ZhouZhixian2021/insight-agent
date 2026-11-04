"""Check the synthetic C-T0 handoff; this is not a production Trace projector."""
import copy
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATES = {'queued', 'running', 'retry_wait', 'succeeded', 'partial_success', 'failed', 'cancelled', 'skipped', 'unknown'}
KINDS = {'run', 'stage', 'paper', 'call', 'attempt'}
SPAN_KEYS = {'spanId', 'parentSpanId', 'kind', 'stage', 'operation', 'academicWorkId', 'workVersionId',
             'providerId', 'model', 'toolName', 'attemptIndex', 'status', 'businessStatus', 'startedAt',
             'endedAt', 'timing', 'failure', 'gaps'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inspect(trace):
    require(trace['schemaVersion'] == 1, 'unsupported version')
    require(all(trace[k] for k in ('traceId', 'sessionId', 'researchRunId')), 'missing identity')
    events = {}
    for event in trace['events']:
        key = event['eventId']
        require(key not in events or events[key] == event, 'event conflict')
        events[key] = event
    ordered = sorted(events.values(), key=lambda e: e['sequence'])
    require(len({e['sequence'] for e in ordered}) == len(ordered), 'sequence collision')
    latest = {}
    first = {}
    for event in ordered:
        require(event['kind'] == 'span_snapshot', 'unsupported observation')
        require(type(event['sequence']) is int and event['sequence'] >= 0, 'invalid sequence')
        span = event['span']
        require(set(span) == SPAN_KEYS, 'span fields differ from handoff')
        require(span['kind'] in KINDS and span['status'] in STATES, 'unknown kind or status')
        first.setdefault(span['spanId'], event['sequence'])
        old = latest.get(span['spanId'])
        if old:
            for key in ('parentSpanId', 'kind', 'academicWorkId', 'workVersionId', 'attemptIndex'):
                require(old[key] == span[key], 'identity changed')
        for timing in span['timing'].values():
            require(timing['basis'] in ('monotonic', 'wall_clock', 'unknown'), 'unknown timing basis')
            require((timing['value'] is None) == (timing['basis'] == 'unknown'), 'unknown duration became zero')
            require(timing['value'] is None or type(timing['value']) in (int, float) and timing['value'] >= 0, 'invalid duration')
        latest[span['spanId']] = span
    attempts = []
    for span in latest.values():
        parent = span['parentSpanId']
        require(parent is None or parent in latest, 'missing referenced parent')
        if parent is None and span['kind'] != 'run':
            require(any(g['code'] == 'parent_unknown' for g in span['gaps']), 'unexplained parent absence')
        seen = {span['spanId']}
        while parent is not None:
            require(parent not in seen, 'parent cycle')
            seen.add(parent)
            parent = latest[parent]['parentSpanId']
        if span['kind'] == 'attempt':
            require(type(span['attemptIndex']) is int and span['attemptIndex'] > 0, 'invalid attempt index')
            require(latest[span['parentSpanId']]['kind'] == 'call', 'attempt parent is not a call')
            attempts.append(span)
        else:
            require(span['attemptIndex'] is None, 'non-attempt index')
    require(len({(s['parentSpanId'], s['attemptIndex']) for s in attempts}) == len(attempts), 'duplicate attempt index')
    roots = [s for s in latest.values() if s['kind'] == 'run']
    require(len(roots) == 1, 'one run required')
    result = {'logicalCalls':sum(s['kind'] == 'call' for s in latest.values()), 'attempts':len(attempts),
              'attemptStates':dict(Counter(s['status'] for s in attempts)),
              'runTotalMs':roots[0]['timing']['totalMs']['value'], 'runStatus':roots[0]['status']}
    return result, latest, first


def main():
    bundle = json.loads((ROOT / 'cases.sample.json').read_text(encoding='utf-8'))
    require(bundle['synthetic'] is True, 'fixtures must be labeled synthetic')
    cases = {c['name']:c for c in bundle['cases']}
    require(set(cases) == {'normal','retry','timeout','cancelled','concurrent','duplicate','restart','historical_missing'}, 'scenario coverage')
    for case in cases.values():
        require(inspect(case['trace'])[0] == case['expected'], 'scenario expectation: ' + case['name'])
    retry = cases['retry']['trace']
    summary, latest, first = inspect(retry)
    require(latest['attempt-1']['failure']['code'] == 'timeout' and latest['attempt-2']['status'] == 'succeeded', 'retry lost failure')
    require(cases['concurrent']['expected']['runTotalMs'] == 1200, 'concurrency wall time')
    require(any(g['code'] == 'interrupted_observation' for g in inspect(cases['restart']['trace'])[1]['run']['gaps']), 'restart gap missing')
    query = json.loads((ROOT / 'queries.sample.json').read_text(encoding='utf-8'))
    items = query['list']['response']['items'] + query['listNext']['response']['items']
    require(items == sorted(latest.values(), key=lambda s:(first[s['spanId']], s['spanId'])), 'pagination mismatch')
    for name in ('list', 'listNext', 'detail'):
        request, response = query[name]['request'], query[name]['response']
        require(request['sessionId'] == retry['sessionId'] and request['researchRunId'] == retry['researchRunId'], 'query scope mismatch')
        require(response['traceId'] == retry['traceId'] and response['snapshotId'] == 'fixture-snapshot-12', 'query snapshot mismatch')
    for name in ('list', 'listNext'):
        actual = query[name]['response']['summary']
        require(actual['logicalCalls'] == summary['logicalCalls'] and actual['attempts'] == summary['attempts'], 'summary count mismatch')
        require(actual['attemptStates'] == {s:summary['attemptStates'].get(s, 0) for s in STATES}, 'summary states mismatch')
        require(actual['runTotalMs']['value'] == summary['runTotalMs'], 'summary timing mismatch')
    require(query['listNext']['request']['cursor'] == query['list']['response']['nextCursor'], 'cursor handoff mismatch')
    detail = query['detail']['response']
    require(detail['span'] == latest['attempt-1'], 'detail mismatch')
    require(detail['events'] == [e for e in retry['events'] if e['span']['spanId'] == 'attempt-1'], 'detail history mismatch')
    # Negative controls prove the checker rejects conflicts and invented timing.
    conflict = copy.deepcopy(retry)
    duplicate = copy.deepcopy(conflict['events'][0])
    duplicate['span']['status'] = 'succeeded'
    conflict['events'].append(duplicate)
    zero = copy.deepcopy(retry)
    zero['events'][0]['span']['timing']['queueMs']['value'] = 0
    for invalid in (conflict, zero):
        try:
            inspect(invalid)
        except ValueError:
            continue
        raise ValueError('negative control unexpectedly accepted')
    print('PASS: 8 synthetic scenarios, list/detail pagination consistency, 2 negative controls.')


if __name__ == '__main__':
    main()
