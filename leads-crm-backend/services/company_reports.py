import os
import sys
import re
import concurrent.futures
from tavily import TavilyClient
from playwright.sync_api import sync_playwright
from db.client import get_client_for_user

api_key = os.environ.get("TAVILY_API_KEY")

def _clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'#+\s*', '', text)          # markdown headers (##, ###)
    text = re.sub(r'\|', ' ', text)             # table pipes
    text = re.sub(r'\[edit\]', '', text)        # wiki edit markers
    text = re.sub(r'-{2,}', '', text)           # long dashes/table separators
    text = re.sub(r'\s+', ' ', text)            # collapse whitespace/newlines
    return text.strip()

def _html_to_pdf(html_content: str) -> bytes:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_content, wait_until="networkidle")
        pdf_bytes = page.pdf(format="A4", print_background=True)
        browser.close()
        return pdf_bytes

def generate_html_report(company_name: str, categorized_results: dict) -> str:
    sections = ""
    for category, data in categorized_results.items():
        answer = _clean_text(data.get("answer", ""))
        results = data.get("results", [])

        if not answer and not results:
            continue

        sections += f'<h2 class="section-title">{category}</h2>\n'

        if answer:
            sections += f'<div class="summary-box">{answer}</div>\n'

        for r in results[:3]:
            title = _clean_text(r.get("title", "")) or "Untitled"
            url = r.get("url", "#")
            domain = url.split("/")[2] if url.startswith("http") and len(url.split("/")) > 2 else url
            content = _clean_text(r.get("content", ""))
            
            published = r.get("published_date", "")
            if published and "T" in published:
                published = published.split("T")[0]
            date_html = f'<span class="source-date">{published}</span>' if published else ""

            if len(content) > 220:
                content = content[:220].rsplit(" ", 1)[0] + "…"
            if not content:
                continue
            sections += f'''
                <div class="source-card">
                    <div class="source-name">{domain}{date_html}</div>
                    <p class="source-text">{content}</p>
                </div>
            '''

    return f'''
    <html>
    <head>
        <style>
            body {{
                font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                color: #1a1a1a;
                max-width: 760px;
                margin: 0 auto;
                padding: 48px 40px;
                line-height: 1.5;
            }}
            .report-title {{ font-size: 28px; font-weight: 700; margin: 0; }}
            .report-subtitle {{ color: #888; font-size: 14px; margin-top: 4px; margin-bottom: 40px; }}
            .section-title {{
                font-size: 16px; font-weight: 700; text-transform: uppercase;
                letter-spacing: 0.05em; color: #444;
                margin-top: 36px; margin-bottom: 12px;
                border-bottom: 2px solid #eee; padding-bottom: 8px;
            }}
            .summary-box {{
                background: #f4f7ff; border-left: 4px solid #4f6df5;
                padding: 16px 18px; border-radius: 6px;
                font-size: 15px; margin-bottom: 16px;
            }}
            .source-card {{
                border: 1px solid #eee; border-radius: 8px;
                padding: 14px 16px; margin-bottom: 10px;
            }}
            .source-name {{ font-size: 12px; font-weight: 600; color: #4f6df5; text-transform: uppercase; margin-bottom: 6px; }}
            .source-date {{ color: #999; font-weight: 400; margin-left: 6px; text-transform: none; }}
            .source-text {{ font-size: 14px; color: #333; margin: 0; }}
            .source-card, .summary-box {{ break-inside: avoid; page-break-inside: avoid;}}
            .section-title {{    break-after: avoid;    page-break-after: avoid;}}
        </style>
    </head>
    <body>
        <div class="report-title">{company_name}</div>
        <div class="report-subtitle">Company research summary</div>
        {sections}
    </body>
    </html>
    '''

def run_company_scrape(report_id: str, company_name: str, user_token: str):
    """Called by the API endpoint as a background task to scrape, create PDF, and save to Supabase."""
    user_client = get_client_for_user(user_token)
    try:
        client = TavilyClient(api_key=api_key)
        
        queries = [
            ("Overview", f"{company_name}"),
            ("Official website", f"{company_name} official website"),
            ("Products", f"{company_name} products"),
            ("Pricing", f"{company_name} pricing"),
            ("Documentation", f"{company_name} documentation"),
            ("Latest news", f"{company_name} latest news"),
            ("Reviews", f"{company_name} reviews"),
            ("Careers", f"{company_name} careers")
        ]
        
        categorized_results = {}
        
        def fetch_category(category_name, query_string):
            try:
                response = client.search(
                    query=query_string,
                    search_depth="advanced",
                    max_results=3, 
                    include_answer=True
                )
                return category_name, {
                    'results': response.get("results", []),
                    'answer': response.get("answer", "")
                }
            except Exception:
                return category_name, {'results': [], 'answer': ''}

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(fetch_category, cat, query) for cat, query in queries]
            for future in concurrent.futures.as_completed(futures):
                cat, res = future.result()
                categorized_results[cat] = res
                
        html_content = generate_html_report(company_name, categorized_results)
        pdf_bytes = _html_to_pdf(html_content)

        # Upload to Supabase Storage
        storage_path = f"{report_id}.pdf"
        user_client.storage.from_("company-reports").upload(
            storage_path, pdf_bytes, {"content-type": "application/pdf"}
        )

        # Update Supabase Table
        user_client.table("company_reports").update({
            "status": "done",
            "storage_path": storage_path,
            "completed_at": "now()",
        }).eq("id", report_id).execute()

    except Exception as e:
        user_client.table("company_reports").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", report_id).execute()

def run_report(targets):
    """CLI function to test the scrape script locally."""
    client = TavilyClient(api_key=api_key)
    
    base_dir = os.getcwd()
    data_dir = os.path.join(base_dir, "ALL_OUTPUT")
    os.makedirs(data_dir, exist_ok=True)
    
    for target in targets:
        brand_name = target.replace("@", "")
        if brand_name.startswith("http"):
            brand_name = brand_name.split("/")[-1] or brand_name.split("/")[-2]
            
        print(f"\\nExecuting Comprehensive Web Search Agent for: {brand_name.upper()}...")
        
        queries = [
            ("Overview", f"{brand_name}"),
            ("Official website", f"{brand_name} official website"),
            ("Products", f"{brand_name} products"),
            ("Pricing", f"{brand_name} pricing"),
            ("Documentation", f"{brand_name} documentation"),
            ("Latest news", f"{brand_name} latest news"),
            ("Reviews", f"{brand_name} reviews"),
            ("Careers", f"{brand_name} careers")
        ]
        
        categorized_results = {}
        for category_name, query_string in queries:
            print(f"  -> Searching: '{query_string}'")
            try:
                response = client.search(
                    query=query_string,
                    search_depth="advanced",
                    max_results=3, 
                    include_answer=True
                )
                categorized_results[category_name] = {
                    'results': response.get("results", []),
                    'answer': response.get("answer", "")
                }
            except Exception as e:
                print(f"     Search failed for '{query_string}': {e}")
                categorized_results[category_name] = {'results': [], 'answer': ''}
                
        html_content = generate_html_report(brand_name, categorized_results)
        
        report_filename = f"{brand_name}_web.html"
        report_filepath = os.path.join(data_dir, report_filename)
        with open(report_filepath, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"Saved comprehensive web report to: {report_filepath}")
        
        print(f"Generating PDF for {brand_name}...")
        try:
            pdf_bytes = _html_to_pdf(html_content)
            pdf_filename = f"{brand_name}_web.pdf"
            pdf_filepath = os.path.join(data_dir, pdf_filename)
            with open(pdf_filepath, "wb") as f:
                f.write(pdf_bytes)
            print(f"Saved comprehensive web PDF to: {pdf_filepath}")
        except Exception as e:
            print(f"Failed to generate PDF: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python company_reports.py <brand_name>")
        sys.exit(1)
        
    targets = sys.argv[1:]
    run_report(targets)