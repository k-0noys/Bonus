// Vercel Serverless Function - 맞춤법 검사 API
export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: '텍스트가 필요합니다.' });
        }

        // 부산대 맞춤법 검사기 API 호출
        const formData = new URLSearchParams();
        formData.append('text1', text.substring(0, 600)); // 600자 제한

        const response = await fetch('http://speller.cs.pusan.ac.kr/results', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error('맞춤법 검사 API 호출 실패');
        }

        const html = await response.text();

        // HTML 파싱 (간단한 정규식 사용)
        const resultMatch = html.match(/<div[^>]*class="result_text"[^>]*>([\s\S]*?)<\/div>/i);

        let correctedText = text;
        let errorCount = 0;

        if (resultMatch) {
            // HTML 태그 제거
            correctedText = resultMatch[1]
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .trim();

            // 오류 개수 세기
            const errorMatches = html.match(/class="error_color"/g);
            errorCount = errorMatches ? errorMatches.length : 0;
        }

        return res.status(200).json({
            corrected: correctedText,
            errorCount: errorCount
        });

    } catch (error) {
        console.error('맞춤법 검사 오류:', error);
        return res.status(500).json({
            error: '맞춤법 검사 중 오류가 발생했습니다.',
            details: error.message
        });
    }
}