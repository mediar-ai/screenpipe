pub fn longest_common_word_substring(s1: &str, s2: &str) -> Option<(usize, usize)> {
  let s1 = s1.to_lowercase();
  let s2 = s2.to_lowercase();

  let s1 = s1.replace(|c| char::is_ascii_punctuation(&c), "");
  let s2 = s2.replace(|c| char::is_ascii_punctuation(&c), "");

  let s1_words: Vec<&str> = s1.split_whitespace().collect();
  let s2_words: Vec<&str> = s2.split_whitespace().collect();

  let s1_len = s1_words.len();
  let s2_len = s2_words.len();

  // Table to store lengths of longest common suffixes of word substrings
  let mut dp = vec![vec![0; s2_len + 1]; s1_len + 1];

  let mut max_len = 0;
  let mut max_index_s1 = None; // Store the starting word index of the longest substring in s1
  let mut max_index_s2 = None; // Store the starting word index of the longest substring in s2

  for i in 1..=s1_len {
      for j in 1..=s2_len {
          if s1_words[i - 1] == s2_words[j - 1] {
              dp[i][j] = dp[i - 1][j - 1] + 1;
              if dp[i][j] > max_len {
                  max_len = dp[i][j];
                  max_index_s1 = Some(i - max_len); // The start index of the match in s1
                  max_index_s2 = Some(j - max_len); // The start index of the match in s2
              }
          }
      }
  }

  match (max_index_s1, max_index_s2) {
      (Some(idx1), Some(idx2)) => Some((idx1, idx2)),
      _ => None,
  }
}
