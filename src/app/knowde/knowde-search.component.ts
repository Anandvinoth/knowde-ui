import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KnowdeService, KnowdeResult, KnowdeSearchResponse } from './knowde.service';

@Component({
  selector: 'app-knowde-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './knowde-search.component.html',
  styleUrls: ['./knowde-search.component.css']
})
export class KnowdeSearchComponent {

  query = '';
  loading = false;
  results: KnowdeResult[] = [];
  facets: KnowdeSearchResponse['results']['facets'] | null = null;
  meta:KnowdeSearchResponse['results']['meta'] | null = null;
  listening = false;
  groundedAnswer: string | null = null;
  ragCollapsed = true;  // default collapsed so large result sets look clean

  private recognition: any;
  private synth = window.speechSynthesis;

  constructor(
    private knowdeService: KnowdeService,
    private zone: NgZone
  ) {

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.continuous = false;

      let speechBuffer = '';
      let silenceTimer: any;

      this.recognition.onresult = (event: any) => {
        const transcript =
          event.results[event.results.length - 1][0].transcript;

        speechBuffer = transcript;

        clearTimeout(silenceTimer);

        silenceTimer = setTimeout(() => {
          // this.zone.run(() => {
          //   this.query = speechBuffer;
          //   this.search();
          // });
          this.zone.run(() => {
            this.query = speechBuffer;
            this.voiceSearch();   // 👈 call voice API instead
          });
        }, 1200);
      };

      this.recognition.onend = () => {
        this.zone.run(() => {
          this.listening = false;
        });
      };
    }
  }

  async search() {
    const cleanQuery = this.query?.trim();
    if (!cleanQuery || cleanQuery.length < 3) {
      this.speak("I didn't quite catch that. Could you repeat?");
      return;
    }

    if (this.listening) {
      this.recognition?.stop();
      this.listening = false;
    }

    this.loading = true;

    try {

      // -----------------------------
      // 1️⃣ Handle "Get All Products"
      // -----------------------------
      if (this.isGetAllIntent(cleanQuery)) {
        const data: any = await this.knowdeService.search('*:*', 500);
        this.processResponse(data);
        this.speak(`Showing all ${this.results.length} products.`);
        this.loading = false;
        return;
      }

      // -----------------------------
      // 2️⃣ Normal Search
      // -----------------------------
      const data: any = await this.knowdeService.search(cleanQuery, 200);
      this.processResponse(data);

      // -----------------------------
      // 3️⃣ Detect & Apply Voice Filters
      // -----------------------------
      const detectedFilters = this.detectFacetFilters(cleanQuery);

      if (Object.keys(detectedFilters).length > 0) {
        this.applyFilters(detectedFilters);
        this.speak(`Filtered down to ${this.results.length} products.`);
      } else {
        const returned = data?.results?.meta?.returned ?? this.results.length;

        if (this.results.length > 0) {
          this.speak(`I found ${returned} relevant products.`);
        } else {
          this.speak("I couldn't find matching products.");
        }
      }

    } catch (error) {
      console.error(error);
      this.speak("Something went wrong while searching.");
    }

    this.loading = false;
  }

async voiceSearch() {
  const cleanQuery = this.query?.trim();
  if (!cleanQuery || cleanQuery.length < 3) {
    this.speak("I didn't quite catch that. Could you repeat?");
    return;
  }

  this.loading = true;

  try {
    const data: any = await this.knowdeService.voiceSearch(cleanQuery);
    this.processResponse(data);

    if (this.results.length > 0) {
      this.speak(`I found ${this.results.length} products.`);
    } else {
      this.speak("I couldn't find matching products.");
    }

  } catch (error) {
    console.error(error);
    this.speak("Something went wrong while searching.");
  }

  this.loading = false;
}

getMatchPercent(p: any): number {
  // If hybrid path already normalized
  if (p.ui_score !== undefined && p.ui_score !== null) {
    return Math.round(p.ui_score * 100);
  }

  // If strong BM25 path (only raw score exists)
  if (p.score && this.results?.length) {
    const maxScore = Math.max(...this.results.map(r => r.score || 0));
    if (maxScore > 0) {
      return Math.round((p.score / maxScore) * 100);
    }
  }

  return 0;
}

  // -----------------------------
  // RESPONSE PROCESSOR
  // -----------------------------
  private processResponse(data: any) {
    if (data?.results?.results?.length > 0) {
      this.results = data.results.results;
      this.facets = data.results.facets || null;
      this.meta = data.results.meta || null;
      this.groundedAnswer = data.results.meta?.grounded_answer?.answer ?? null;
      this.ragCollapsed = false;
    } else {
      this.results = [];
      this.facets = null;
      this.groundedAnswer = null;
    }
  }

  // -----------------------------
  // GET ALL INTENT DETECTION
  // -----------------------------
  private isGetAllIntent(query: string): boolean {
    const q = query.toLowerCase();
    return (
      q.includes('all products') ||
      q.includes('show everything') ||
      q.includes('full catalog') ||
      q.includes('list everything')
    );
  }

  // -----------------------------
  // DYNAMIC FACET DETECTION
  // -----------------------------
  private detectFacetFilters(query: string) {
    const q = query.toLowerCase();
    const selected: any = {};

    const checkFacet = (facetKey: string) => {
      const buckets = (this.facets as any)?.[facetKey] || [];

      for (const bucket of buckets) {
        if (q.includes(bucket.value.toLowerCase())) {
          selected[facetKey] = bucket.val;
        }
      }
    };

    checkFacet('chemical_family');
    checkFacet('applications');
    checkFacet('end_uses');
    checkFacet('product_families');

    return selected;
  }

  // -----------------------------
  // APPLY FILTERS
  // -----------------------------
  private applyFilters(filters: any) {
    this.results = this.results.filter(product => {

      return Object.entries(filters).every(([key, value]) => {
        const field = (product as any)[key] || [];
        return field.includes(value);
      });

    });
  }

  // -----------------------------
  // IMAGE FALLBACK
  // -----------------------------
  hideImage(event: Event) {
    const img = event.target as HTMLImageElement | null;
    if (img) {
      img.style.display = 'none';
    }
  }

  // -----------------------------
  // MIC CONTROL
  // -----------------------------
  toggleMic() {
    if (!this.recognition) return;

    if (this.listening) {
      this.recognition.stop();
      this.listening = false;
    } else {
      this.synth.cancel();
      this.listening = true;
      this.recognition.start();
    }
  }

  // -----------------------------
  // TTS
  // -----------------------------
  // private speak(text: string) {
  //   if (!this.synth) return;

  //   this.synth.cancel();

  //   const utterance = new SpeechSynthesisUtterance(text);
  //   utterance.lang = 'en-US';
  //   utterance.rate = 1;
  //   utterance.pitch = 1;

  //   this.synth.speak(utterance);
  // }

  private speak(text: string) {
  if (!this.synth) return;

  // 🔴 Stop recognition BEFORE speaking
  if (this.recognition && this.listening) {
    this.recognition.stop();
    this.listening = false;
  }

  this.synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;

  // 🔴 Safety: ensure mic stays off while speaking
  utterance.onstart = () => {
    if (this.recognition) {
      this.recognition.stop();
      this.listening = false;
    }
  };

  this.synth.speak(utterance);
}

  applyFacetFilter(key: string, value: string) {
    this.query = `${this.query} ${value}`;
    this.search();
  }
}
