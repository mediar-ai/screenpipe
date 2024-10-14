use clap::ValueEnum;
use serde::Serialize;
use std::fmt;

#[derive(ValueEnum, Clone, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
#[repr(usize)]
pub enum Language {
    #[clap(name = "english")]
    English,
    #[clap(name = "chinese")]
    Chinese,
    #[clap(name = "german")]
    German,
    #[clap(name = "spanish")]
    Spanish,
    #[clap(name = "russian")]
    Russian,
    #[clap(name = "korean")]
    Korean,
    #[clap(name = "french")]
    French,
    #[clap(name = "japanese")]
    Japanese,
    #[clap(name = "portuguese")]
    Portuguese,
    #[clap(name = "turkish")]
    Turkish,
    #[clap(name = "polish")]
    Polish,
    #[clap(name = "catalan")]
    Catalan,
    #[clap(name = "dutch")]
    Dutch,
    #[clap(name = "arabic")]
    Arabic,
    #[clap(name = "swedish")]
    Swedish,
    #[clap(name = "italian")]
    Italian,
    #[clap(name = "indonesian")]
    Indonesian,
    #[clap(name = "hindi")]
    Hindi,
    #[clap(name = "finnish")]
    Finnish,
    #[clap(name = "hebrew")]
    Hebrew,
    #[clap(name = "ukrainian")]
    Ukrainian,
    #[clap(name = "greek")]
    Greek,
    #[clap(name = "malay")]
    Malay,
    #[clap(name = "czech")]
    Czech,
    #[clap(name = "romanian")]
    Romanian,
    #[clap(name = "danish")]
    Danish,
    #[clap(name = "hungarian")]
    Hungarian,
    #[clap(name = "norwegian")]
    Norwegian,
    #[clap(name = "thai")]
    Thai,
    #[clap(name = "urdu")]
    Urdu,
    #[clap(name = "croatian")]
    Croatian,
    #[clap(name = "bulgarian")]
    Bulgarian,
    #[clap(name = "lithuanian")]
    Lithuanian,
    #[clap(name = "latin")]
    Latin,
    #[clap(name = "malayalam")]
    Malayalam,
    #[clap(name = "welsh")]
    Welsh,
    #[clap(name = "slovak")]
    Slovak,
    #[clap(name = "persian")]
    Persian,
    #[clap(name = "latvian")]
    Latvian,
    #[clap(name = "bengali")]
    Bengali,
    #[clap(name = "serbian")]
    Serbian,
    #[clap(name = "azerbaijani")]
    Azerbaijani,
    #[clap(name = "slovenian")]
    Slovenian,
    #[clap(name = "estonian")]
    Estonian,
    #[clap(name = "macedonian")]
    Macedonian,
    #[clap(name = "nepali")]
    Nepali,
    #[clap(name = "mongolian")]
    Mongolian,
    #[clap(name = "bosnian")]
    Bosnian,
    #[clap(name = "kazakh")]
    Kazakh,
    #[clap(name = "albanian")]
    Albanian,
    #[clap(name = "swahili")]
    Swahili,
    #[clap(name = "galician")]
    Galician,
    #[clap(name = "marathi")]
    Marathi,
    #[clap(name = "punjabi")]
    Punjabi,
    #[clap(name = "sinhala")]
    Sinhala,
    #[clap(name = "khmer")]
    Khmer,
    #[clap(name = "afrikaans")]
    Afrikaans,
    #[clap(name = "belarusian")]
    Belarusian,
    #[clap(name = "gujarati")]
    Gujarati,
    #[clap(name = "amharic")]
    Amharic,
    #[clap(name = "yiddish")]
    Yiddish,
    #[clap(name = "lao")]
    Lao,
    #[clap(name = "uzbek")]
    Uzbek,
    #[clap(name = "faroese")]
    Faroese,
    #[clap(name = "pashto")]
    Pashto,
    #[clap(name = "maltese")]
    Maltese,
    #[clap(name = "sanskrit")]
    Sanskrit,
    #[clap(name = "luxembourgish")]
    Luxembourgish,
    #[clap(name = "myanmar")]
    Myanmar,
    #[clap(name = "tibetan")]
    Tibetan,
    #[clap(name = "tagalog")]
    Tagalog,
    #[clap(name = "assamese")]
    Assamese,
    #[clap(name = "tatar")]
    Tatar,
    #[clap(name = "hausa")]
    Hausa,
    #[clap(name = "javanese")]
    Javanese,
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let possible_value = self.to_possible_value().unwrap();
        let action_name = possible_value.get_name();
        write!(f, "{}", action_name)
    }
}

impl PartialEq<&str> for Language {
    fn eq(&self, other: &&str) -> bool {
        self.to_string().as_str() == *other
    }
}
