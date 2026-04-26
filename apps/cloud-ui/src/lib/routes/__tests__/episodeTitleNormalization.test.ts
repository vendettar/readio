import { describe, expect, it } from 'vitest'
import { normalizeEpisodeTitle, titlesAreEqual } from '../episodeTitleNormalization'

describe('normalizeEpisodeTitle', () => {
  describe('basic normalization', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeEpisodeTitle('  Episode Title  ')).toBe('episode title')
      expect(normalizeEpisodeTitle('\tEpisode Title\n')).toBe('episode title')
    })

    it('normalizes case to lowercase', () => {
      expect(normalizeEpisodeTitle('Episode Title')).toBe('episode title')
      expect(normalizeEpisodeTitle('EPISODE TITLE')).toBe('episode title')
      expect(normalizeEpisodeTitle('EpIsOdE TiTlE')).toBe('episode title')
    })

    it('collapses repeated internal whitespace', () => {
      expect(normalizeEpisodeTitle('Episode    Title')).toBe('episode title')
      expect(normalizeEpisodeTitle('Episode \t\n  Title')).toBe('episode title')
    })
  })

  describe('Unicode normalization', () => {
    it('normalizes NFC', () => {
      // é can be represented as single character or e + combining accent
      const decomposed = 'e\u0301' // é as e + combining acute
      const composed = '\u00e9' // é as single character
      expect(normalizeEpisodeTitle(decomposed)).toBe(normalizeEpisodeTitle(composed))
    })
  })

  describe('curly quotes vs straight quotes', () => {
    it('converts left single curly quote', () => {
      expect(normalizeEpisodeTitle('\u2018Episode Title\u2019')).toBe("'episode title'")
    })

    it('converts right single curly quote', () => {
      expect(normalizeEpisodeTitle('\u2019Episode Title\u2018')).toBe("'episode title'")
    })

    it('converts left double curly quote', () => {
      expect(normalizeEpisodeTitle('\u201cEpisode Title\u201d')).toBe('"episode title"')
    })

    it('converts right double curly quote', () => {
      expect(normalizeEpisodeTitle('\u201dEpisode Title\u201c')).toBe('"episode title"')
    })

    it('converts single low-9 quotation mark', () => {
      expect(normalizeEpisodeTitle('\u201aEpisode Title\u201b')).toBe("'episode title'")
    })

    it('converts double low-9 quotation mark', () => {
      expect(normalizeEpisodeTitle('\u201eEpisode Title\u201e')).toBe('"episode title"')
    })
  })

  describe('hyphen and dash variants', () => {
    it('converts hyphen', () => {
      expect(normalizeEpisodeTitle('\u2010Episode \u2010 Title')).toBe('episode-title')
    })

    it('converts non-breaking hyphen', () => {
      expect(normalizeEpisodeTitle('\u2011Episode \u2011 Title')).toBe('episode-title')
    })

    it('converts figure dash', () => {
      expect(normalizeEpisodeTitle('\u2012Episode \u2012 Title')).toBe('episode-title')
    })

    it('converts en dash', () => {
      expect(normalizeEpisodeTitle('\u2013Episode \u2013 Title')).toBe('episode-title')
    })

    it('converts em dash', () => {
      expect(normalizeEpisodeTitle('\u2014Episode \u2014 Title')).toBe('episode-title')
    })

    it('converts horizontal bar', () => {
      expect(normalizeEpisodeTitle('\u2015Episode \u2015 Title')).toBe('episode-title')
    })

    it('normal dash is preserved', () => {
      expect(normalizeEpisodeTitle('Episode-Title')).toBe('episode-title')
    })
  })

  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(normalizeEpisodeTitle(null)).toBeNull()
    })

    it('returns null for undefined input', () => {
      expect(normalizeEpisodeTitle(undefined)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(normalizeEpisodeTitle('')).toBeNull()
    })

    it('returns null for whitespace-only string', () => {
      expect(normalizeEpisodeTitle('   ')).toBeNull()
    })

    it('handles non-string input gracefully', () => {
      expect(normalizeEpisodeTitle(123 as unknown as string)).toBeNull()
      expect(normalizeEpisodeTitle({} as unknown as string)).toBeNull()
    })
  })

  describe('real-world examples', () => {
    it('matches smart quotes variant', () => {
      expect(normalizeEpisodeTitle('Episode 1: "The Beginning"')).toBe(
        normalizeEpisodeTitle('Episode 1: "The Beginning"')
      )
    })

    it('matches hyphen vs em dash', () => {
      expect(normalizeEpisodeTitle('Episode 1 - The Beginning')).toBe(
        normalizeEpisodeTitle('Episode 1\u2014The Beginning')
      )
    })

    it('matches case-insensitive title', () => {
      expect(normalizeEpisodeTitle('THE DAILY')).toBe(normalizeEpisodeTitle('the daily'))
    })
  })
})

describe('titlesAreEqual', () => {
  it('returns true for identical titles', () => {
    expect(titlesAreEqual('Episode Title', 'Episode Title')).toBe(true)
  })

  it('returns true for normalized-equivalent titles', () => {
    expect(titlesAreEqual('  EPISODE  TITLE  ', 'episode title')).toBe(true)
    expect(titlesAreEqual("Episode 'Title'", 'Episode "Title"')).toBe(false) // quotes differ
  })

  it('returns true for both null inputs', () => {
    expect(titlesAreEqual(null, null)).toBe(true)
    expect(titlesAreEqual(undefined, undefined)).toBe(true)
  })

  it('returns false for one null input', () => {
    expect(titlesAreEqual('Episode Title', null)).toBe(false)
    expect(titlesAreEqual(null, 'Episode Title')).toBe(false)
  })

  it('returns false for different titles', () => {
    expect(titlesAreEqual('Episode 1', 'Episode 2')).toBe(false)
  })
})
