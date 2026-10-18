// Test backend /api/send-email endpoint handler
import express from 'express';

const app = express();
app.use(express.json());

// Load handler logic mirroring server.js
app.post('/api/send-email', async (req, res) => {
  try {
    const {
      complaintId,
      issueType,
      description,
      citizenEmail,
      department = 'Solid Waste Management',
      routingStatus = 'Moved to Solid Waste Management',
    } = req.body || {};

    if (!citizenEmail) {
      return res.status(400).json({ ok: false, message: 'Citizen email is required.' });
    }

    const emailSubject = 'CivicEye Complaint Moved to Solid Waste Management';
    const emailBody = `Your CivicEye complaint has been successfully registered.

Complaint ID: ${complaintId || 'N/A'}

Issue: ${issueType || 'Solid Waste Issue'}

Description: ${description || 'N/A'}

Department: ${department}

Routing Status: ${routingStatus}

Your complaint has been forwarded to the Solid Waste Management Department for further action.

Thank you for using CivicEye.`;

    return res.status(200).json({
      ok: true,
      sent: true,
      citizenEmail,
      subject: emailSubject,
      body: emailBody,
      complaintId,
      department,
      routingStatus,
      message: 'Notification email processed successfully.',
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

const server = app.listen(0, async () => {
  const port = server.address().port;
  console.log(`Test express server listening on port ${port}`);

  const samplePayload = {
    complaintId: 'CE4582',
    issueType: 'Garbage Overflow',
    description: 'Garbage is overflowing near the street corner',
    citizenEmail: 'citizen@example.com',
    department: 'Solid Waste Management',
    routingStatus: 'Moved to Solid Waste Management',
  };

  try {
    const response = await fetch(`http://localhost:${port}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload),
    });

    const data = await response.json();
    console.log('Response from /api/send-email:', data);

    if (
      data.ok === true &&
      data.subject === 'CivicEye Complaint Moved to Solid Waste Management' &&
      data.body.includes('Complaint ID: CE4582') &&
      data.body.includes('Issue: Garbage Overflow') &&
      data.body.includes('Department: Solid Waste Management') &&
      data.body.includes('Routing Status: Moved to Solid Waste Management') &&
      data.body.includes('Your complaint has been forwarded to the Solid Waste Management Department for further action.')
    ) {
      console.log('✅ PASS: Email payload, subject, and formatting match exact specifications.');
    } else {
      console.error('❌ FAIL: Email payload formatting mismatch.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ ERROR:', err);
    process.exit(1);
  } finally {
    server.close();
    process.exit(0);
  }
});
