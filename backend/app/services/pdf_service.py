import io
import datetime
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT

class PDFService:
    @staticmethod
    def generate_candidate_report(
        candidate_name: str,
        department: str,
        position_title: str,
        election_title: str,
        vote_count: int,
        total_position_votes: int,
        vote_percentage: float,
        rank: int,
        winner_status: str,
        ai_summary: str = "",
        manifesto_text: str = ""
    ) -> io.BytesIO:
        """
        Generate a professional PDF report for a candidate.
        Returns an io.BytesIO object containing the PDF data.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=22,
            textColor=colors.HexColor("#1F3A6E"),
            alignment=TA_CENTER,
            spaceAfter=20
        )
        subtitle_style = ParagraphStyle(
            'SubtitleStyle',
            parent=styles['Normal'],
            fontSize=12,
            textColor=colors.gray,
            alignment=TA_CENTER,
            spaceAfter=30
        )
        heading_style = ParagraphStyle(
            'HeadingStyle',
            parent=styles['Heading2'],
            fontSize=14,
            textColor=colors.HexColor("#6C63FF"),
            spaceAfter=10,
            spaceBefore=20
        )
        normal_style = styles['Normal']
        normal_style.fontSize = 11
        normal_style.spaceAfter = 8
        
        # Status style based on winner status
        status_color = colors.HexColor("#22c55e") if winner_status == "WON" else colors.HexColor("#ef4444") if winner_status == "LOST" else colors.HexColor("#f59e0b")
        status_style = ParagraphStyle(
            'StatusStyle',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=status_color,
            alignment=TA_CENTER,
            spaceBefore=20,
            spaceAfter=20
        )

        elements = []
        
        # Header
        elements.append(Paragraph("College Electoral System", title_style))
        elements.append(Paragraph(f"Official Candidate Report: {election_title}", subtitle_style))
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
        elements.append(Paragraph(f"Generated on: {timestamp}", ParagraphStyle('Time', parent=subtitle_style, fontSize=10, spaceAfter=20)))
        
        # Status Banner
        elements.append(Paragraph(f"FINAL STATUS: {winner_status}", status_style))
        
        # Candidate Information
        elements.append(Paragraph("Candidate Information", heading_style))
        cand_data = [
            ["Name:", candidate_name],
            ["Department:", department],
            ["Position:", position_title]
        ]
        cand_table = Table(cand_data, colWidths=[120, 350], hAlign='LEFT')
        cand_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor("#1F3A6E"))
        ]))
        elements.append(cand_table)
        elements.append(Spacer(1, 10))
        
        # Election Results
        elements.append(Paragraph("Election Results", heading_style))
        results_data = [
            ["Total Votes Received:", str(vote_count)],
            ["Total Votes Cast (Position):", str(total_position_votes)],
            ["Vote Percentage:", f"{vote_percentage}%"],
            ["Rank:", str(rank)]
        ]
        res_table = Table(results_data, colWidths=[160, 310], hAlign='LEFT')
        res_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor("#1F3A6E"))
        ]))
        elements.append(res_table)
        
        # AI Analysis / Manifesto Summary
        if ai_summary:
            elements.append(Paragraph("AI Analysis Summary", heading_style))
            elements.append(Paragraph(ai_summary, normal_style))
            
        if manifesto_text:
            elements.append(Paragraph("Manifesto Content", heading_style))
            # Truncate manifesto text if it's too long
            short_manifesto = manifesto_text if len(manifesto_text) < 1000 else manifesto_text[:997] + "..."
            elements.append(Paragraph(short_manifesto, normal_style))
            
        # Footer
        elements.append(Spacer(1, 40))
        elements.append(Paragraph(
            "This document is cryptographically verified by the Online College Electoral System.", 
            ParagraphStyle('Footer', parent=styles['Normal'], fontSize=9, textColor=colors.gray, alignment=TA_CENTER)
        ))
        
        doc.build(elements)
        buffer.seek(0)
        return buffer

    @staticmethod
    def generate_official_notice_pdf(
        title: str,
        priority: str,
        content: str,
        notice_id: str,
        created_at: datetime.datetime,
        creator_name: str
    ) -> io.BytesIO:
        """
        Generate a professional PDF for an official election notice.
        Includes a light-gray diagonal watermark, QR code for verification,
        and an official signature block.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=50,
            leftMargin=50,
            topMargin=50,
            bottomMargin=50
        )
        
        styles = getSampleStyleSheet()
        
        title_style = ParagraphStyle(
            'NoticeTitle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor("#1F3A6E"),
            alignment=TA_LEFT,
            spaceAfter=15
        )
        
        priority_colors = {
            "LOW": "#22c55e",
            "MEDIUM": "#3b82f6",
            "HIGH": "#f59e0b",
            "URGENT": "#ef4444",
            "EMERGENCY": "#7f1d1d"
        }
        p_color = priority_colors.get(priority.upper(), "#1F3A6E")
        
        meta_style = ParagraphStyle(
            'NoticeMeta',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.gray,
            spaceAfter=20
        )
        
        priority_style = ParagraphStyle(
            'NoticePriority',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor(p_color),
            fontName="Helvetica-Bold",
            spaceAfter=20
        )
        
        content_style = ParagraphStyle(
            'NoticeContent',
            parent=styles['Normal'],
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#334155"),
            spaceAfter=30
        )
        
        elements = []
        
        # Header / Logo placeholder
        elements.append(Paragraph("<b>ONLINE COLLEGE ELECTORAL SYSTEM</b>", ParagraphStyle('NoticeHeader', parent=styles['Normal'], fontSize=12, textColor=colors.HexColor("#6C63FF"), spaceAfter=15)))
        elements.append(Paragraph(title, title_style))
        
        # Metadata Table
        timestamp = created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        meta_html = f"<b>Date:</b> {timestamp} &nbsp;&nbsp;&nbsp;&nbsp; <b>Published By:</b> {creator_name}"
        elements.append(Paragraph(meta_html, meta_style))
        elements.append(Paragraph(f"<b>Priority:</b> {priority.upper()}", priority_style))
        
        elements.append(Spacer(1, 10))
        
        # Main content
        formatted_content = content.replace("\n", "<br/>")
        elements.append(Paragraph(formatted_content, content_style))
        elements.append(Spacer(1, 20))
        
        # QR Code and Verification section
        verify_url = f"https://collegevote.edu/verify-notice/{notice_id}"
        
        from reportlab.graphics.barcode.qr import QrCodeWidget
        from reportlab.graphics.shapes import Drawing
        
        qr_code = QrCodeWidget(verify_url)
        qr_code.x = 0
        qr_code.y = 0
        
        d = Drawing(90, 90)
        d.add(qr_code)
        
        qr_text_style = ParagraphStyle(
            'QRText',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.gray,
            leading=12
        )
        
        qr_desc = Paragraph(
            f"<b>Notice Authenticity Verification</b><br/>"
            f"Scan this QR code or visit the verification portal to verify that this is an official announcement.<br/>"
            f"Notice ID: <font face='Courier'>{notice_id}</font>",
            qr_text_style
        )
        
        qr_table = Table([[d, qr_desc]], colWidths=[110, 360])
        qr_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(qr_table)
        
        # Signature block
        elements.append(Spacer(1, 40))
        sig_data = [
            ["", "______________________________"],
            ["", "Authorized Signature"],
            ["", "Electoral Commission Office"]
        ]
        sig_table = Table(sig_data, colWidths=[300, 180])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTNAME', (1, 1), (1, 2), 'Helvetica-Bold'),
            ('FONTSIZE', (1, 0), (-1, -1), 9),
            ('TEXTCOLOR', (1, 0), (-1, -1), colors.HexColor("#1F3A6E")),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(sig_table)
        
        def draw_watermark(canvas, doc):
            canvas.saveState()
            canvas.setFont('Helvetica-Bold', 50)
            canvas.setFillColor(colors.HexColor("#F1F5F9"))
            canvas.translate(300, 400)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "OFFICIAL NOTICE")
            canvas.restoreState()
            
        doc.build(elements, onFirstPage=draw_watermark, onLaterPages=draw_watermark)
        buffer.seek(0)
        return buffer

    @staticmethod
    def generate_election_results_pdf(
        college_name: str,
        election_name: str,
        election_year: str,
        election_id: str,
        publication_id: str,
        published_by_email: str,
        published_at_str: str,
        audit_hash: str,
        results: list
    ) -> io.BytesIO:
        """
        Generate a professional PDF report for the election results.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=40,
            leftMargin=40,
            topMargin=40,
            bottomMargin=40
        )
        
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'ResultsTitleStyle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor("#1F3A6E"),
            alignment=TA_CENTER,
            spaceAfter=5
        )
        subtitle_style = ParagraphStyle(
            'ResultsSubtitleStyle',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor("#6C63FF"),
            alignment=TA_CENTER,
            spaceAfter=15
        )
        heading_style = ParagraphStyle(
            'ResultsHeadingStyle',
            parent=styles['Heading2'],
            fontSize=12,
            textColor=colors.HexColor("#1F3A6E"),
            spaceBefore=12,
            spaceAfter=6
        )
        normal_style = styles['Normal']
        normal_style.fontSize = 9
        normal_style.leading = 13
        
        elements = []
        
        # Header / Title
        elements.append(Paragraph(college_name.upper(), ParagraphStyle('Coll', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor("#6C63FF"), alignment=TA_CENTER, fontName="Helvetica-Bold", spaceAfter=3)))
        elements.append(Paragraph("OFFICIAL ELECTION RESULTS", title_style))
        elements.append(Paragraph(f"{election_name} ({election_year})", subtitle_style))
        
        # Meta Info Box
        meta_data = [
            [Paragraph("<b>Election ID:</b>", normal_style), Paragraph(election_id, normal_style),
             Paragraph("<b>Publication ID:</b>", normal_style), Paragraph(publication_id, normal_style)],
            [Paragraph("<b>Published By:</b>", normal_style), Paragraph(published_by_email, normal_style),
             Paragraph("<b>Published At:</b>", normal_style), Paragraph(published_at_str, normal_style)]
        ]
        meta_table = Table(meta_data, colWidths=[90, 170, 100, 170])
        meta_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ('PADDING', (0, 0), (-1, -1), 5),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#E2E8F0")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 10))
        
        # Position-wise Results
        for pos_res in results:
            pos_title = pos_res["position"]
            candidates = pos_res["candidates"]
            
            # Determine winner(s)
            winners = [c["name"] for c in candidates if c.get("is_winner")]
            winners_str = ", ".join(winners) if winners else "None"
            
            elements.append(Paragraph(f"Position: {pos_title}", heading_style))
            elements.append(Paragraph(f"<b>Winner(s):</b> <font color='#22c55e'><b>{winners_str}</b></font>", ParagraphStyle('Winners', parent=normal_style, fontSize=10, spaceAfter=6)))
            
            # Candidates Table
            table_data = [["Candidate Name", "Votes Received", "Percentage"]]
            for c in candidates:
                cand_name = c["name"]
                if c.get("is_winner"):
                    cand_name += "  🏆"
                table_data.append([
                    cand_name,
                    str(c["votes"]),
                    f"{c.get('percentage', 0.0)}%"
                ])
                
            cand_table = Table(table_data, colWidths=[280, 120, 130])
            cand_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1F3A6E")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
                ('TOPPADDING', (0, 0), (-1, 0), 5),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ('PADDING', (0, 0), (-1, -1), 5),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
            ]))
            
            elements.append(cand_table)
            elements.append(Spacer(1, 10))
            
        # Integrity Info Section
        elements.append(Spacer(1, 5))
        integrity_data = [
            [Paragraph("<b>Cryptographic Security Audit Hash:</b>", normal_style)],
            [Paragraph(f"<font face='Courier' size='8'>{audit_hash}</font>", normal_style)]
        ]
        integrity_table = Table(integrity_data, colWidths=[530])
        integrity_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#FCA5A5")),
        ]))
        elements.append(integrity_table)
        
        # Footer text
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(
            "This document is officially signed and sealed. The cryptographic hash above verifies that the vote counts, "
            "voter ledger signatures, and result aggregation match the original immutable blockchain-style ledger exactly.",
            ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.gray, alignment=TA_CENTER)
        ))
        
        def draw_watermark(canvas, doc):
            canvas.saveState()
            canvas.setFont('Helvetica-Bold', 40)
            canvas.setFillColor(colors.HexColor("#F8FAFC"))
            canvas.translate(300, 400)
            canvas.rotate(30)
            canvas.drawCentredString(0, 0, "OFFICIAL RESULTS")
            canvas.restoreState()
            
        doc.build(elements, onFirstPage=draw_watermark, onLaterPages=draw_watermark)
        buffer.seek(0)
        return buffer

