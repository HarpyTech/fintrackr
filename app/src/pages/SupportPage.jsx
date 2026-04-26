import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageCircle, FileText, Phone, Clock, MapPin, Send } from 'lucide-react';

const SUPPORT_CHANNELS = [
  { Icon: Mail, title: 'Email Support', description: 'Get help via email', detail: 'support@fintrackr.com', color: 'blue', action: 'Send Email' },
  { Icon: MessageCircle, title: 'Live Chat', description: '24/7 chat support', detail: 'Average response: 2 minutes', color: 'green', action: 'Start Chat' },
  { Icon: Phone, title: 'Phone Support', description: 'Talk to our team', detail: '+1 (555) 123-4567', color: 'purple', action: 'Call Now' },
  { Icon: FileText, title: 'Help Center', description: 'Browse guides & FAQs', detail: '100+ articles available', color: 'orange', action: 'View Docs' },
];

const FAQS = [
  {
    question: 'How do I reset my password?',
    answer: "Go to the login page and click 'Forgot Password'. Enter your email address and we'll send you a reset link.",
  },
  {
    question: 'Can I export my expense data?',
    answer: 'Yes! Go to the Report page and use the "Export" button to download your data in CSV or PDF format.',
  },
  {
    question: 'How does AI receipt scanning work?',
    answer: 'Our AI uses OCR (Optical Character Recognition) to read receipt images and automatically extract vendor, amount, date, and line items.',
  },
  {
    question: 'Is my financial data secure?',
    answer: 'Absolutely. We use bank-level encryption (AES-256) to protect your data. Your information is never shared with third parties.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, Amex), PayPal, and bank transfers.',
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes, you can cancel anytime from your account settings. No cancellation fees apply.',
  },
];

export default function SupportPage() {
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setFormData({ name: '', email: '', subject: '', message: '' });
    }, 3000);
  }

  return (
    <div className="support-proto">
      {/* Reuse features-proto header styles — same public page pattern */}
      <header className="features-proto-header">
        <div className="features-proto-header-inner">
          <Link to="/" className="features-proto-brand">
            <img src="/assets/name_logo.svg" alt="FinTrackr" className="features-proto-brand-logo" />
          </Link>
          <Link to="/login" className="features-proto-signin">Sign In</Link>
        </div>
      </header>

      <div className="support-proto-container">
        {/* Page header */}
        <div className="support-proto-page-header">
          <h1 className="support-proto-title">How Can We Help?</h1>
          <p className="support-proto-subtitle">Get the support you need, when you need it</p>
        </div>

        {/* Support Channels */}
        <div className="support-proto-channels">
          {SUPPORT_CHANNELS.map((ch, idx) => (
            <div key={idx} className="support-proto-channel-card">
              <div className={`support-proto-channel-icon support-proto-icon-${ch.color}`}>
                <ch.Icon size={24} />
              </div>
              <h3 className="support-proto-channel-title">{ch.title}</h3>
              <p className="support-proto-channel-desc">{ch.description}</p>
              <p className="support-proto-channel-detail">{ch.detail}</p>
              <button type="button" className="support-proto-channel-action">{ch.action}</button>
            </div>
          ))}
        </div>

        {/* Contact form + Office info */}
        <div className="support-proto-main-grid">
          {/* Contact Form */}
          <div className="support-proto-card">
            <h2 className="support-proto-card-title">Send Us a Message</h2>
            {submitted ? (
              <div className="support-proto-form-success">
                ✅ Your message has been sent! We'll get back to you within 24 hours.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="support-proto-form">
                <label className="support-proto-form-label">
                  Name
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="support-proto-form-input"
                    required
                  />
                </label>
                <label className="support-proto-form-label">
                  Email
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="support-proto-form-input"
                    required
                  />
                </label>
                <label className="support-proto-form-label">
                  Subject
                  <select
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                    className="support-proto-form-select"
                    required
                  >
                    <option value="">Select a topic</option>
                    <option value="technical">Technical Issue</option>
                    <option value="billing">Billing Question</option>
                    <option value="feature">Feature Request</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="support-proto-form-label">
                  Message
                  <textarea
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                    className="support-proto-form-textarea"
                    rows={4}
                    required
                  />
                </label>
                <button type="submit" className="support-proto-form-submit">
                  <Send size={16} />
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* Office info */}
          <div className="support-proto-info-stack">
            <div className="support-proto-card">
              <h2 className="support-proto-card-title">Office Hours</h2>
              <div className="support-proto-info-items">
                <div className="support-proto-info-item">
                  <Clock size={20} className="support-proto-info-icon" />
                  <div>
                    <p className="support-proto-info-item-title">Support Hours</p>
                    <p className="support-proto-info-item-detail">
                      Monday – Friday: 9:00 AM – 6:00 PM PST<br />
                      Saturday: 10:00 AM – 4:00 PM PST<br />
                      Sunday: Closed
                    </p>
                  </div>
                </div>
                <div className="support-proto-info-item">
                  <MapPin size={20} className="support-proto-info-icon" />
                  <div>
                    <p className="support-proto-info-item-title">Head Office</p>
                    <p className="support-proto-info-item-detail">
                      123 Finance Street<br />
                      San Francisco, CA 94102<br />
                      United States
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="support-proto-urgent">
              <h3 className="support-proto-urgent-title">Need Immediate Help?</h3>
              <p className="support-proto-urgent-text">
                For urgent issues, our live chat is available 24/7 with an average response time of just 2 minutes.
              </p>
              <button type="button" className="support-proto-urgent-btn">
                <MessageCircle size={16} />
                Start Live Chat
              </button>
            </div>
          </div>
        </div>

        {/* FAQs */}
        <div className="support-proto-faq">
          <h2 className="support-proto-faq-title">Frequently Asked Questions</h2>
          <div className="support-proto-faq-list">
            {FAQS.map((faq, idx) => (
              <div key={idx} className="support-proto-faq-item">
                <h3 className="support-proto-faq-question">{faq.question}</h3>
                <p className="support-proto-faq-answer">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
