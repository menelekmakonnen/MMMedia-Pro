/**
 * SequencePage — alias for the canonical SequenceLayout.
 *
 * The Sequence workspace is implemented by `SequenceLayout`, which provides the
 * Upload | Media | Edit | Mix | Effects | Scopes sub-tabs. This re-export exists
 * so callers can import a stable "SequencePage" name.
 */
export { SequenceLayout as SequencePage } from './SequenceLayout';
