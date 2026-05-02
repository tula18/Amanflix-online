"""
Fuzzy string matching — implemented from scratch (no external libraries).

Score is a float in [0.0, 1.0] combining four signals:
  1. N-gram (trigram) Dice coefficient  — good for transpositions / typos
  2. Longest Common Subsequence ratio   — good for deletions / abbreviated input
  3. Word-boundary prefix bonus         — reward query-as-prefix-of-word matches
  4. Word-set overlap ratio             — fraction of query words present in text
"""


# ---------------------------------------------------------------------------
# Signal 1 — N-gram Dice coefficient
# ---------------------------------------------------------------------------

def _ngrams(text: str, n: int) -> dict:
    """Return a multiset of n-grams as {gram: count}."""
    grams: dict = {}
    for i in range(len(text) - n + 1):
        gram = text[i : i + n]
        grams[gram] = grams.get(gram, 0) + 1
    return grams


def _dice_coefficient(a_grams: dict, b_grams: dict) -> float:
    """
    Dice coefficient = 2 * |intersection| / (|A| + |B|)
    where |X| is the total count of grams in the multiset.
    """
    total_a = sum(a_grams.values())
    total_b = sum(b_grams.values())
    if total_a + total_b == 0:
        return 0.0
    intersection = sum(
        min(a_grams.get(g, 0), b_grams.get(g, 0)) for g in a_grams
    )
    return (2.0 * intersection) / (total_a + total_b)


def _ngram_similarity(query: str, text: str, n: int = 3) -> float:
    """Dice coefficient on n-grams, falling back to smaller n for short strings."""
    # Pad strings with spaces so edge characters get grams too
    padded_q = f" {query} "
    padded_t = f" {text} "
    effective_n = min(n, len(padded_q), len(padded_t))
    if effective_n < 1:
        return 0.0
    q_grams = _ngrams(padded_q, effective_n)
    t_grams = _ngrams(padded_t, effective_n)
    return _dice_coefficient(q_grams, t_grams)


# ---------------------------------------------------------------------------
# Signal 2 — Longest Common Subsequence (LCS) ratio
# ---------------------------------------------------------------------------

def _lcs_length(a: str, b: str) -> int:
    """
    Compute the length of the Longest Common Subsequence of a and b.
    Uses O(min(|a|, |b|)) space via the two-row DP technique.
    """
    if len(a) < len(b):
        a, b = b, a          # ensure a is the longer string
    lb = len(b)
    prev = [0] * (lb + 1)
    curr = [0] * (lb + 1)
    for ch_a in a:
        for j in range(1, lb + 1):
            if ch_a == b[j - 1]:
                curr[j] = prev[j - 1] + 1
            else:
                pj = prev[j]
                cj = curr[j - 1]
                curr[j] = pj if pj > cj else cj
        prev, curr = curr, prev
    return prev[lb]


def _lcs_ratio(query: str, text: str) -> float:
    """LCS length / max(len(query), len(text))."""
    if not query or not text:
        return 0.0
    lcs = _lcs_length(query, text)
    return lcs / max(len(query), len(text))


# ---------------------------------------------------------------------------
# Signal 3 — Prefix bonus
# ---------------------------------------------------------------------------

def _prefix_bonus(query: str, text: str) -> float:
    """
    Returns a bonus in [0.0, 1.0]:
      - 1.0  if text starts with the entire query
      - 0.7  if any whitespace-separated word in text starts with query
      - 0.0  otherwise
    """
    if text.startswith(query):
        return 1.0
    for word in text.split():
        if word.startswith(query):
            return 0.7
    return 0.0


# ---------------------------------------------------------------------------
# Signal 4 — Word-set overlap ratio
# ---------------------------------------------------------------------------

def _word_overlap(query: str, text: str) -> float:
    """
    Fraction of unique query words that appear as substrings within text words.
    Example: query="dark knight" text="the dark knight rises" → 2/2 = 1.0
    """
    q_words = set(query.split())
    if not q_words:
        return 0.0
    t_words = text.split()
    matched = sum(
        1 for qw in q_words
        if any(qw in tw for tw in t_words)
    )
    return matched / len(q_words)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fuzzy_score(query: str, text: str) -> float:
    """
    Compute a fuzzy similarity score between query and text.

    Returns a float in [0.0, 1.0].

    Algorithm:
      1. Normalize both strings (lowercase, stripped).
      2. Exact substring match          → 1.0 immediately.
      3. Compute four signals (above).
      4. Return weighted linear combination.

    Weights (must sum to 1.0):
      - trigram Dice:   0.40
      - LCS ratio:      0.30
      - word overlap:   0.20
      - prefix bonus:   0.10
    """
    q = query.strip().lower()
    t = text.strip().lower()

    if not q or not t:
        return 0.0

    # Fast exact-substring short-circuit
    if q in t:
        return 1.0

    dice  = _ngram_similarity(q, t, n=3)
    lcs   = _lcs_ratio(q, t)
    words = _word_overlap(q, t)
    pfx   = _prefix_bonus(q, t)

    score = 0.40 * dice + 0.30 * lcs + 0.20 * words + 0.10 * pfx
    return round(min(score, 1.0), 4)


def fuzzy_filter_and_rank(query: str, items: list, text_getter, threshold: float = 0.25) -> list:
    """
    Filter and rank items by fuzzy score.

    Args:
        query:       Search query string.
        items:       List of items to score.
        text_getter: Callable(item) → str that extracts the searchable text.
        threshold:   Minimum score to include [0.0, 1.0].  Default 0.25.

    Returns:
        List of items (not tuples) sorted by score descending.
        Items with score < threshold are excluded.
    """
    q = query.strip().lower()
    if not q:
        return list(items)

    # Pre-compute query n-grams ONCE — reused for every item to avoid
    # recomputing the same grams 100K+ times per request.
    padded_q = f" {q} "
    q_n = min(3, len(padded_q))
    q_grams = _ngrams(padded_q, q_n)
    q_gram_keys = frozenset(q_grams)

    scored = []
    for item in items:
        text = text_getter(item) or ""
        t = text.strip().lower()
        if not t:
            continue

        # Exact-substring short-circuit (C-speed, free)
        if q in t:
            scored.append((1.0, item))
            continue

        # Compute text n-grams once — reused for both pre-filter and dice.
        padded_t = f" {t} "
        t_n = min(q_n, len(padded_t))
        if t_n < 1:
            continue
        t_grams = _ngrams(padded_t, t_n)

        # Trigram pre-filter: if no n-gram from the query appears in the text
        # the Dice score is 0.  With threshold=0.25 and dice weight=0.40 the
        # remaining signals alone rarely exceed 0.25, so skip early.
        if not q_gram_keys.intersection(t_grams):
            continue

        # Dice — reuse pre-computed grams; re-derive q_grams only for the rare
        # case where a very short title requires a smaller effective n.
        active_q_grams = q_grams if t_n == q_n else _ngrams(padded_q, t_n)
        dice = _dice_coefficient(active_q_grams, t_grams)

        # Cap strings fed to LCS to bound O(n·m) cost for long titles.
        lcs_val = _lcs_ratio(q[:50], t[:50])
        words   = _word_overlap(q, t)
        pfx     = _prefix_bonus(q, t)

        score = round(min(0.40 * dice + 0.30 * lcs_val + 0.20 * words + 0.10 * pfx, 1.0), 4)
        if score >= threshold:
            scored.append((score, item))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in scored]
