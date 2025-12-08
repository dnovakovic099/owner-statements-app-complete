// Improved Statement HTML Template with better layout and typography
function generateStatementHTML(statement, id) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Owner Statement ${id} - Luxury Lodging Host</title>
    <style>
        :root {
            --luxury-navy: #1e3a5f;
            --luxury-gold: #d4af37;
            --luxury-light-gold: #f4e7c1;
            --luxury-gray: #6b7280;
            --luxury-light-gray: #f8fafc;
            --luxury-green: #059669;
            --luxury-red: #dc2626;
            --luxury-white: #ffffff;
            --luxury-dark: #1a202c;
            --luxury-border: #e2e8f0;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Arial', sans-serif; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 30px; 
            line-height: 1.6;
            color: var(--luxury-navy);
            background: white;
            font-size: 14px;
        }
        
        /* Page break controls */
        .page-break-avoid {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        .page-break-before {
            page-break-before: always;
            break-before: always;
        }
        
        .header {
            background: linear-gradient(135deg, var(--luxury-navy) 0%, #2d4a6b 100%);
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
            color: white;
            box-shadow: 0 4px 12px rgba(30, 58, 95, 0.15);
            page-break-inside: avoid;
        }
        
        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            padding-bottom: 20px;
        }
        
        .company-info h1 {
            font-size: 36px;
            font-weight: 700;
            color: white;
            margin-bottom: 10px;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .contact-info {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 400;
            line-height: 1.6;
        }
        
        .logo-box {
            width: 80px;
            height: 80px;
            background: rgba(255, 255, 255, 0.15);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--luxury-gold);
            font-weight: 700;
            font-size: 14px;
            backdrop-filter: blur(10px);
        }
        
        .statement-details {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            padding: 15px 0;
        }
        
        .meta-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .meta-label {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.7);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .meta-value {
            font-size: 15px;
            font-weight: 600;
            color: white;
        }
        
        /* Summary Box - Now at top */
        .summary-box {
            background: linear-gradient(135deg, #f8fafc 0%, #e5e7eb 100%);
            padding: 28px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            margin-bottom: 35px;
            page-break-inside: avoid;
        }
        
        .summary-box h3 {
            color: var(--luxury-navy);
            font-size: 22px;
            margin-bottom: 22px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            border-bottom: 3px solid var(--luxury-gold);
            padding-bottom: 12px;
        }
        
        .summary-box table {
            width: 100%;
            border-collapse: collapse;
            font-size: 15px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        
        .summary-box tr {
            border-bottom: 1px solid #e5e7eb;
        }
        
        .summary-box tr:last-child {
            border-bottom: none;
        }
        
        .summary-box td {
            padding: 18px 22px;
        }
        
        .summary-label {
            font-weight: 600;
            color: #1f2937;
            font-size: 15px;
        }
        
        .summary-value {
            text-align: right;
            font-weight: 700;
            font-size: 16px;
        }
        
        .summary-value.revenue {
            color: #059669;
        }
        
        .summary-value.expense {
            color: #dc2626;
        }
        
        .total-row {
            background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
            color: white !important;
        }
        
        .total-row td {
            padding: 22px !important;
            border: none !important;
        }
        
        .total-row .summary-label {
            font-size: 17px;
            letter-spacing: 0.5px;
            color: white !important;
        }
        
        .total-row .summary-value {
            font-size: 20px;
            color: white !important;
        }
        
        .section-title {
            font-size: 20px;
            font-weight: 700;
            color: var(--luxury-navy);
            margin-bottom: 20px;
            margin-top: 35px;
            padding: 10px 0;
            border-bottom: 3px solid var(--luxury-gold);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            page-break-after: avoid;
        }
        
        .rental-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            font-size: 13px;
            margin-bottom: 25px;
            table-layout: fixed;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .rental-table th {
            background: var(--luxury-dark);
            color: white;
            padding: 16px 10px;
            text-align: center;
            font-weight: 700;
            font-size: 13px;
            text-transform: uppercase;
            line-height: 1.4;
            border-right: 1px solid rgba(255,255,255,0.2);
            word-wrap: break-word;
            hyphens: auto;
        }

        .rental-table th:first-child {
            border-left: 1px solid var(--luxury-dark);
        }

        .rental-table th:last-child {
            border-right: 1px solid var(--luxury-dark);
        }

        .rental-table thead {
            page-break-after: avoid;
            page-break-inside: avoid;
        }

        .rental-table td {
            padding: 14px 10px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
            text-align: center;
            vertical-align: middle;
            line-height: 1.5;
        }

        .rental-table td:first-child {
            border-left: 1px solid #e5e7eb;
        }

        .rental-table td:last-child {
            border-right: 1px solid #e5e7eb;
        }

        .rental-table tbody tr {
            page-break-inside: avoid;
        }

        /* Column widths for better layout */
        .rental-table th:nth-child(1) { width: 18%; }  /* Guest Details */
        .rental-table th:nth-child(2) { width: 10%; }  /* Base Rate */
        .rental-table th:nth-child(3) { width: 11%; }  /* Cleaning & Other Fees */
        .rental-table th:nth-child(4) { width: 10%; }  /* Platform Fees */
        .rental-table th:nth-child(5) { width: 11%; }  /* Client Revenue */
        .rental-table th:nth-child(6) { width: 12%; }  /* Luxury Lodging Fee */
        .rental-table th:nth-child(7) { width: 10%; }  /* Tax */
        .rental-table th:nth-child(8) { width: 12%; }  /* Client Payout */
        
        .guest-details-cell {
            text-align: left !important;
            padding: 12px 10px !important;
            max-width: none;
            overflow: hidden;
            vertical-align: middle !important;
        }
        
        .guest-name {
            font-weight: 700;
            color: var(--luxury-navy);
            font-size: 14px;
            margin-bottom: 5px;
            line-height: 1.3;
        }
        
        .guest-info {
            font-size: 12px;
            color: var(--luxury-gray);
            margin-bottom: 5px;
            line-height: 1.3;
        }
        
        .channel-badge {
            display: inline-block;
            background: var(--luxury-light-gold);
            color: var(--luxury-navy);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .proration-info {
            font-size: 10px;
            color: #007bff;
            margin-top: 3px;
        }
        
        .amount-cell {
            text-align: right;
            font-size: 13px;
            font-weight: 700;
            padding-right: 10px !important;
        }
        
        .expense-amount { color: var(--luxury-red); }
        .revenue-amount { color: var(--luxury-navy); }
        .payout-amount { color: var(--luxury-navy); font-weight: 700; }
        
        .totals-row {
            page-break-inside: avoid;
            page-break-before: avoid;
        }
        
        .totals-row td {
            background: var(--luxury-navy);
            color: white;
            font-weight: 700;
            font-size: 13px;
            padding: 16px 10px;
            border-top: 2px solid var(--luxury-navy);
        }
        
        .payout-cell {
            background: var(--luxury-light-gold) !important;
            color: var(--luxury-navy) !important;
            font-weight: 700;
        }
        
        /* Expenses and Upsells Tables */
        .expenses-section, .upsells-section {
            margin-top: 35px;
            page-break-inside: avoid;
        }
        
        .expenses-section h3, .upsells-section h3 {
            color: var(--luxury-navy);
            font-size: 20px;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            border-bottom: 3px solid var(--luxury-gold);
            padding-bottom: 12px;
            page-break-after: avoid;
        }
        
        .expense-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .expense-table thead {
            page-break-after: avoid;
            page-break-inside: avoid;
        }
        
        .expense-table thead tr {
            background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
            color: white;
        }
        
        .expense-table th {
            padding: 16px 14px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            letter-spacing: 0.5px;
        }
        
        .expense-table th:last-child {
            text-align: right;
        }
        
        .expense-table td {
            padding: 14px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
        }
        
        .expense-table tbody tr {
            page-break-inside: avoid;
        }
        
        .expense-table tr:hover {
            background-color: #f9fafb;
        }
        
        .expense-table .total-row {
            background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
            color: white;
            page-break-inside: avoid;
            page-break-before: avoid;
        }
        
        .expense-table .total-row td {
            padding: 18px 14px;
            font-weight: 700;
            border: none;
            font-size: 14px;
            letter-spacing: 0.5px;
        }
        
        .footer {
            background: var(--luxury-light-gray);
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            margin-top: 35px;
            page-break-inside: avoid;
        }
        
        .generated-info {
            color: var(--luxury-gray);
            font-size: 13px;
        }
        
        @media print {
            body {
                padding: 20px;
            }
            
            .page-break-avoid {
                page-break-inside: avoid !important;
            }
            
            .section-title {
                page-break-after: avoid !important;
            }
            
            .rental-table thead,
            .expense-table thead {
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
            }
            
            .rental-table tbody tr,
            .expense-table tbody tr,
            .totals-row {
                page-break-inside: avoid !important;
            }
            
            .totals-row,
            .expense-table .total-row {
                page-break-before: avoid !important;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-header">
            <div class="company-info">
                <h1>Luxury Lodging</h1>
                <div class="contact-info">
                    <span>support@luxurylodgingpm.com | +1 (813) 594-8882</span>
                </div>
            </div>
            <div class="logo-box">Luxury Lodging</div>
        </div>
        
        <div class="statement-details">
            <div class="meta-item">
                <span class="meta-label">Statement Period</span>
                <span class="meta-value">${statement.weekStartDate} - ${statement.weekEndDate}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Property</span>
                <span class="meta-value">${statement.propertyName || `Property ${statement.propertyId}`}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Owner</span>
                <span class="meta-value">${statement.ownerName || 'Client'}</span>
            </div>
        </div>
    </div>

    <!-- Summary Box - Moved to top -->
    <div class="summary-box page-break-avoid">
        <h3>STATEMENT SUMMARY</h3>
        <table>
            <tr>
                <td class="summary-label">Gross Payout</td>
                <td class="summary-value" style="color: ${(() => {
                    const totalGrossPayout = statement.reservations?.reduce((sum, res) => {
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
                        const clientRevenue = isCohostAirbnb ? 0 : (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount);
                        const luxuryFee = clientRevenue * (statement.pmPercentage / 100);
                        const grossPayout = isCohostAirbnb ? -luxuryFee : (clientRevenue - luxuryFee);
                        return sum + grossPayout;
                    }, 0) || 0;
                    return totalGrossPayout >= 0 ? '#059669' : '#dc2626';
                })()};">${(() => {
                    const totalGrossPayout = statement.reservations?.reduce((sum, res) => {
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
                        const clientRevenue = isCohostAirbnb ? 0 : (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount);
                        const luxuryFee = clientRevenue * (statement.pmPercentage / 100);
                        const grossPayout = isCohostAirbnb ? -luxuryFee : (clientRevenue - luxuryFee);
                        return sum + grossPayout;
                    }, 0) || 0;
                    return (totalGrossPayout >= 0 ? '$' : '-$') + Math.abs(totalGrossPayout).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                })()}</td>
            </tr>
            ${statement.items?.filter(item => item.type === 'upsell').length > 0 ? `
            <tr>
                <td class="summary-label">Additional Payouts</td>
                <td class="summary-value revenue">+$${(statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            ` : ''}
            <tr>
                <td class="summary-label">Expenses</td>
                <td class="summary-value expense">-$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            <tr class="total-row">
                <td class="summary-label"><strong>NET PAYOUT</strong></td>
                <td class="summary-value"><strong>$${(() => {
                    const totalGrossPayout = statement.reservations?.reduce((sum, res) => {
                        const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                        const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
                        const clientRevenue = isCohostAirbnb ? 0 : (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount);
                        const luxuryFee = clientRevenue * (statement.pmPercentage / 100);
                        const grossPayout = isCohostAirbnb ? -luxuryFee : (clientRevenue - luxuryFee);
                        return sum + grossPayout;
                    }, 0) || 0;
                    const upsells = statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0;
                    const expenses = statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0;
                    return (totalGrossPayout + upsells - expenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                })()}</strong></td>
            </tr>
        </table>
    </div>

    <div class="content">
        <h2 class="section-title">Rental Activity</h2>
        <table class="rental-table page-break-avoid">
            <thead>
                <tr>
                    <th>Guest Details</th>
                    <th>Base Rate</th>
                    <th>Guest Fees</th>
                    <th>Platform Fees</th>
                    <th>Revenue</th>
                    <th>PM Commission</th>
                    <th>Tax</th>
                    <th>Gross Payout</th>
                </tr>
            </thead>
            <tbody>
                ${statement.reservations?.slice().sort((a, b) => new Date(a.checkInDate) - new Date(b.checkInDate)).map(reservation => {
                    // Check if this is an Airbnb reservation on a co-hosted property
                    const isAirbnb = reservation.source && reservation.source.toLowerCase().includes('airbnb');
                    const isCohostAirbnb = isAirbnb && statement.isCohostOnAirbnb;
                    
                    // Use detailed financial data if available, otherwise fall back to calculated values
                    const baseRate = reservation.hasDetailedFinance ? reservation.baseRate : (reservation.grossAmount * 0.85);
                    const cleaningFees = reservation.hasDetailedFinance ? reservation.cleaningAndOtherFees : (reservation.grossAmount * 0.15);
                    const platformFees = reservation.hasDetailedFinance ? reservation.platformFees : (reservation.grossAmount * 0.03);
                    const clientRevenue = reservation.hasDetailedFinance ? reservation.clientRevenue : reservation.grossAmount;
                    // PM Commission is calculated based on clientRevenue (which accounts for proration)
                    const luxuryFee = clientRevenue * (statement.pmPercentage / 100);
                    const taxResponsibility = reservation.hasDetailedFinance ? reservation.clientTaxResponsibility : 0;
                    
                    // Tax calculation priority:
                    // 1. If disregardTax is true: NEVER add tax (company remits on behalf of owner)
                    // 2. For Airbnb without pass-through: no tax added (Airbnb remits taxes)
                    // 3. For non-Airbnb OR Airbnb with pass-through: include tax responsibility
                    const shouldAddTax = !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
                    const taxToAdd = shouldAddTax ? taxResponsibility : 0;

                    // For co-hosted Airbnb: Gross Payout is negative PM commission only
                    // For others: Normal calculation
                    const grossPayout = isCohostAirbnb
                        ? -luxuryFee
                        : (clientRevenue - luxuryFee);
                    const clientPayout = grossPayout + taxToAdd;
                    
                    return `
                    <tr>
                        <td class="guest-details-cell">
                            <div class="guest-name">${reservation.guestName}</div>
                            <div class="guest-info">${(() => {
                                const [yearIn, monthIn, dayIn] = reservation.checkInDate.split('-').map(Number);
                                const [yearOut, monthOut, dayOut] = reservation.checkOutDate.split('-').map(Number);
                                const checkIn = new Date(yearIn, monthIn - 1, dayIn).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                const checkOut = new Date(yearOut, monthOut - 1, dayOut).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                return `${checkIn} - ${checkOut} (${reservation.nights || 0}n)`;
                            })()}</div>
                            <div class="channel-badge">${reservation.source}</div>
                            ${reservation.prorationNote ?
                                `<div class="proration-info">
                                    ${reservation.prorationNote}
                                </div>` : ''
                            }
                        </td>
                        <td class="amount-cell">$${baseRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell">$${cleaningFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell expense-amount">-$${platformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell revenue-amount">$${clientRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell expense-amount">-$${luxuryFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell ${shouldAddTax ? 'revenue-amount' : 'expense-amount'}">${shouldAddTax ? '+' : '-'}$${taxResponsibility.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell payout-amount">$${clientPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    `;
                }).join('') || '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #666;">No reservations for this period</td></tr>'}
                <tr class="totals-row">
                    <td><strong>TOTALS</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.baseRate : res.grossAmount * 0.85), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.cleaningAndOtherFees : res.grossAmount * 0.15), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.platformFees : res.grossAmount * 0.03), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>-$${Math.abs(statement.reservations?.reduce((sum, res) => {
                        const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : res.grossAmount;
                        return sum + (clientRevenue * (statement.pmPercentage / 100));
                    }, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell"><strong>$${(statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientTaxResponsibility : 0), 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell payout-cell"><strong>$${(() => {
                        const totalRevenue = statement.reservations?.reduce((sum, res) => sum + (res.hasDetailedFinance ? res.clientRevenue : res.grossAmount), 0) || 0;
                        const totalPmCommission = statement.reservations?.reduce((sum, res) => {
                            const clientRevenue = res.hasDetailedFinance ? res.clientRevenue : res.grossAmount;
                            return sum + (clientRevenue * (statement.pmPercentage / 100));
                        }, 0) || 0;
                        // Add tax for non-Airbnb bookings, or Airbnb with pass-through tax enabled
                        // But never add if disregardTax is enabled
                        const totalTaxToAdd = statement.reservations?.reduce((sum, res) => {
                            const isAirbnb = res.source && res.source.toLowerCase().includes('airbnb');
                            const taxAmount = res.hasDetailedFinance ? res.clientTaxResponsibility : 0;
                            const shouldAddTax = !statement.disregardTax && (!isAirbnb || statement.airbnbPassThroughTax);
                            return sum + (shouldAddTax ? taxAmount : 0);
                        }, 0) || 0;
                        return (totalRevenue - totalPmCommission + totalTaxToAdd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    })()}</strong></td>
                </tr>
            </tbody>
        </table>
        
        <!-- Expenses Section -->
        <div class="expenses-section page-break-avoid">
            <h3>EXPENSES</h3>
            <table class="expense-table">
                <thead>
                    <tr>
                        <th>DATE</th>
                        <th>DESCRIPTION</th>
                        <th>PROPERTY</th>
                        <th>CATEGORY</th>
                        <th style="text-align: right;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${statement.items?.filter(item => item.type === 'expense').map(expense => {
                        // Check if this expense is part of a duplicate warning
                        const isDuplicate = statement.duplicateWarnings && statement.duplicateWarnings.some(dup => {
                            const matchesExpense1 = dup.expense1.description === expense.description && 
                                                   Math.abs(dup.expense1.amount - expense.amount) < 0.01 && 
                                                   dup.expense1.date === expense.date;
                            const matchesExpense2 = dup.expense2.description === expense.description && 
                                                   Math.abs(dup.expense2.amount - expense.amount) < 0.01 && 
                                                   dup.expense2.date === expense.date;
                            return matchesExpense1 || matchesExpense2;
                        });
                        
                        return `
                        <tr${isDuplicate ? ' style="background-color: #fff3cd; border-left: 4px solid #ffc107;"' : ''}>
                            <td style="font-weight: 500; color: #374151;">
                                ${(() => {
                                    const [year, month, day] = expense.date.split('-').map(Number);
                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                })()}
                                ${isDuplicate ? '<br><span style="color: #856404; font-size: 10px; font-weight: 600;">Duplicate</span>' : ''}
                            </td>
                            <td style="line-height: 1.5; color: #1f2937; font-weight: 500;">${expense.description}</td>
                            <td style="color: #6b7280; font-size: 11px;">${expense.listing || '-'}</td>
                            <td style="text-transform: capitalize; color: #6b7280;">${expense.category}</td>
                            <td style="text-align: right; font-weight: 700; color: #dc2626;">$${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                        `;
                    }).join('') || '<tr><td colspan="5" style="text-align: center; padding: 24px; color: #9ca3af; font-style: italic;">No expenses for this period</td></tr>'}
                    <tr class="total-row">
                        <td colspan="4"><strong>TOTAL EXPENSES</strong></td>
                        <td style="text-align: right;"><strong>$${(statement.items?.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Additional Payouts Section (Upsells) -->
        ${statement.items?.filter(item => item.type === 'upsell').length > 0 ? `
        <div class="upsells-section page-break-avoid">
            <h3>ADDITIONAL PAYOUTS</h3>
            <table class="expense-table">
                <thead>
                    <tr>
                        <th>DATE</th>
                        <th>DESCRIPTION</th>
                        <th>PROPERTY</th>
                        <th>CATEGORY</th>
                        <th style="text-align: right;">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${statement.items?.filter(item => item.type === 'upsell').map(upsell => `
                        <tr>
                            <td style="font-weight: 500; color: #374151;">
                                ${(() => {
                                    const [year, month, day] = upsell.date.split('-').map(Number);
                                    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
                                })()}
                            </td>
                            <td style="line-height: 1.5; color: #1f2937; font-weight: 500;">${upsell.description}</td>
                            <td style="color: #6b7280; font-size: 11px;">${upsell.listing || '-'}</td>
                            <td style="text-transform: capitalize; color: #6b7280;">${upsell.category}</td>
                            <td style="text-align: right; font-weight: 700; color: #059669;">+$${upsell.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                    `).join('')}
                    <tr class="total-row">
                        <td colspan="4"><strong>TOTAL ADDITIONAL PAYOUTS</strong></td>
                        <td style="text-align: right;"><strong>+$${(statement.items?.filter(item => item.type === 'upsell').reduce((sum, item) => sum + item.amount, 0) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
        ` : ''}
    </div>

    <div class="footer">
        <div class="generated-info">
            Statement generated on ${new Date().toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })}
        </div>
    </div>
</body>
</html>`;
}

module.exports = { generateStatementHTML };
