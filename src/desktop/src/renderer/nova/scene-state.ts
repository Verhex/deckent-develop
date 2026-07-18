/**
 * 589/P19 — Komuta-sahnesi UI durum-makinesi (saf, DOM-suz, string-suz —
 * river-projection.ts disiplini; etiketleri caller i18n'den çözer).
 *
 * İlk eşleşen satır kazanır (katı öncelik):
 *
 * | pri | state     | koşul          | idleLine  | centerLabel |
 * |-----|-----------|----------------|-----------|-------------|
 * | 1   | OFFLINE   | offline        | 'offline' | none        |
 * | 2   | RUNNING   | sprintActive   | hidden    | phase       |
 * | 3   | ORDER     | order ≠ null   | hidden    | ellipsis    |
 * | 4   | CHAT      | chatStreaming  | hidden    | ellipsis    |
 * | 5   | COMPOSING | draftNonEmpty  | hidden    | none        |
 * | 6   | IDLE      | (else)         | 'idle'    | ready       |
 *
 * P19-çekirdek: READY ilk tuşta ölür (COMPOSING) ve yanıt akarken geri
 * dönmez (CHAT — Enter draft'ı temizlediği için ayrı durum şart).
 */

export type SceneStateName = 'OFFLINE' | 'RUNNING' | 'ORDER' | 'CHAT' | 'COMPOSING' | 'IDLE';

export type OrderPhase = 'previewing' | 'ready' | 'starting';

export interface SceneInput {
  offline: boolean;
  sprintActive: boolean;
  draftNonEmpty: boolean;
  order: OrderPhase | null;
  chatStreaming: boolean;
}

export interface SceneVisibility {
  /** DOM overlay satırı: hangi metin (veya gizli). */
  idleLine: 'idle' | 'offline' | 'hidden';
  /** Canvas çekirdek merkez-etiketi. */
  centerLabel: 'phase' | 'ellipsis' | 'ready' | 'none';
}

export interface SceneState {
  state: SceneStateName;
  visibility: SceneVisibility;
}

export function deriveSceneState(input: SceneInput): SceneState {
  if (input.offline) {
    return { state: 'OFFLINE', visibility: { idleLine: 'offline', centerLabel: 'none' } };
  }
  if (input.sprintActive) {
    return { state: 'RUNNING', visibility: { idleLine: 'hidden', centerLabel: 'phase' } };
  }
  if (input.order !== null) {
    return { state: 'ORDER', visibility: { idleLine: 'hidden', centerLabel: 'ellipsis' } };
  }
  if (input.chatStreaming) {
    return { state: 'CHAT', visibility: { idleLine: 'hidden', centerLabel: 'ellipsis' } };
  }
  if (input.draftNonEmpty) {
    return { state: 'COMPOSING', visibility: { idleLine: 'hidden', centerLabel: 'none' } };
  }
  return { state: 'IDLE', visibility: { idleLine: 'idle', centerLabel: 'ready' } };
}
