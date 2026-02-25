import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface KnowdeSearchResponse {
  query: string;
  results: {
    query: string;
    totalCount: number;
    results: KnowdeResult[];
    facets: any;
    meta?: any;
  };
}

export interface KnowdeResult {
  id: string;
  name?: string[];
  summary?: string[];
  description?: string[];
  banner_url?: string;
  logo_url?: string;
  hybrid_score?: number;
  ui_score?: number;
  score?:number;

  applications?: string[];
  end_uses?: string[];
  chemical_family?: string[];
  product_families?: string[];
  supplier?:string;
}

@Injectable({
  providedIn: 'root'
})
export class KnowdeService {

  private hybridUrl = 'http://localhost:8000/api/knowde/search/hybrid';
  private voiceUrl  = 'http://localhost:8000/api/v1/voice/search';

  constructor(private http: HttpClient) {}

  // 🔎 Normal hybrid search
  async search(query: string, limit?: number): Promise<KnowdeSearchResponse> {

    let effectiveLimit = limit;

    if (!effectiveLimit) {
      if (query.toLowerCase().includes('all products')) {
        effectiveLimit = 1000;
      } else {
        effectiveLimit = 25;
      }
    }

    const response = await firstValueFrom(
      this.http.post<KnowdeSearchResponse>(this.hybridUrl, {
        query,
        limit: effectiveLimit
      })
    );

    return response;
  }

  // 🎤 Voice search (NEW)
  async voiceSearch(transcript: string): Promise<KnowdeSearchResponse> {

    const raw: any = await firstValueFrom(
      this.http.post(this.voiceUrl, { transcript })
    );

    // 🔥 Normalize voice response to match hybrid structure
    return {
      query: raw.query,
      results: {
        query: raw.query,
        totalCount: raw.results?.length || 0,
        results: raw.results || [],
        facets: raw.facets || {},
        meta: raw.meta || {}
      }
    };
 }
}
