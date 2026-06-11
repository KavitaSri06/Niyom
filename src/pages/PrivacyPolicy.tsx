import { Shield } from 'lucide-react';
import {
  LegalDocumentLayout,
  LegalSection,
  LegalSubsection,
  LegalList,
  ContactBox
} from '../components/LegalDocumentLayout';

interface PrivacyPolicyProps {
  onClose: () => void;
}

export function PrivacyPolicy({ onClose }: PrivacyPolicyProps) {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      subtitle="Niyom Wealth Distribution LLP"
      icon={<Shield className="w-16 h-16 text-slate-700" strokeWidth={1.5} />}
      onClose={onClose}
    >
      <LegalSection number="1" title="Introduction">
        <p>
          Niyom Wealth Distribution LLP ("we," "our," or "us") is committed to protecting your privacy.
          This Privacy Policy explains how we collect, use, disclose, and safeguard your information
          when you visit our website and use our services.
        </p>
      </LegalSection>

      <LegalSection number="2" title="Information We Collect">
        <LegalSubsection number="2.1" title="Personal Information">
          <p>We collect personal information that you voluntarily provide to us when you:</p>
          <LegalList items={[
            'Register for an account',
            'Complete KYC (Know Your Customer) verification',
            'Place orders for financial products',
            'Contact us for support',
            'Subscribe to our newsletters or communications'
          ]} />
          <p className="mt-4">This information may include:</p>
          <LegalList items={[
            'Full name and contact information (email, phone number, address)',
            'Date of birth and PAN details',
            'Government-issued identification documents',
            'Bank account details',
            'Investment preferences and financial information',
            'Employment and income details'
          ]} />
        </LegalSubsection>

        <LegalSubsection number="2.2" title="Automatically Collected Information">
          <p>When you access our website, we automatically collect certain information about your device, including:</p>
          <LegalList items={[
            'IP address and browser type',
            'Operating system and device information',
            'Pages visited and time spent on pages',
            'Referring website addresses'
          ]} />
        </LegalSubsection>

        <LegalSubsection number="2.3" title="Financial Transaction Information">
          <p>
            We collect details about your transactions with us, including purchase history,
            investment portfolio information, and payment details.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="3" title="How We Use Your Information">
        <p>We use the collected information for the following purposes:</p>
        <LegalList items={[
          'To create and manage your account',
          'To process KYC verification as required by regulatory authorities',
          'To execute and settle financial transactions',
          'To provide customer support and respond to inquiries',
          'To send important updates about your investments and account',
          'To comply with legal and regulatory requirements',
          'To prevent fraud and enhance security',
          'To improve our services and user experience',
          'To send marketing communications (with your consent)'
        ]} />
      </LegalSection>

      <LegalSection number="4" title="Information Sharing and Disclosure">
        <p className="mb-4">We may share your information with:</p>

        <LegalSubsection number="4.1" title="Regulatory Authorities">
          <p>
            We share information with SEBI, stock exchanges, depositories, and other regulatory
            bodies as required by law.
          </p>
        </LegalSubsection>

        <LegalSubsection number="4.2" title="Service Providers">
          <p>We engage third-party service providers to perform functions on our behalf, including:</p>
          <LegalList items={[
            'Payment processing',
            'KYC verification services',
            'Data storage and hosting',
            'Customer support',
            'Email and communication services'
          ]} />
        </LegalSubsection>

        <LegalSubsection number="4.3" title="Business Partners">
          <p>
            We may share information with mutual fund houses, depositories, and other financial
            institutions to execute your transactions.
          </p>
        </LegalSubsection>

        <LegalSubsection number="4.4" title="Legal Requirements">
          <p>
            We may disclose your information if required by law, court order, or governmental
            request, or to protect our rights and property.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="5" title="Data Security">
        <p>We implement appropriate technical and organizational measures to protect your personal information, including:</p>
        <LegalList items={[
          'Encryption of data in transit and at rest',
          'Secure access controls and authentication',
          'Regular security assessments and audits',
          'Employee training on data protection',
          'Secure data centers with physical security measures'
        ]} />
        <p className="mt-4 italic text-slate-600">
          However, no method of transmission over the Internet or electronic storage is 100% secure.
          While we strive to protect your information, we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection number="6" title="Data Retention">
        <p>
          We retain your personal information for as long as necessary to fulfill the purposes
          outlined in this Privacy Policy, unless a longer retention period is required by law.
          KYC documents and transaction records are retained for the periods mandated by regulatory authorities.
        </p>
      </LegalSection>

      <LegalSection number="7" title="Your Rights">
        <p>You have the right to:</p>
        <LegalList items={[
          'Access your personal information we hold',
          'Request correction of inaccurate information',
          'Request deletion of your information (subject to legal obligations)',
          'Opt-out of marketing communications',
          'Lodge a complaint with relevant data protection authorities'
        ]} />
        <p className="mt-4">
          To exercise these rights, please contact us at <strong>support@niyomwealth.com</strong>.
        </p>
      </LegalSection>

      <LegalSection number="8" title="Cookies and Tracking Technologies">
        <p>
          We use cookies and similar tracking technologies to enhance your experience, analyze
          usage patterns, and improve our services. You can control cookie preferences through
          your browser settings.
        </p>
      </LegalSection>

      <LegalSection number="9" title="Third-Party Links">
        <p>
          Our website may contain links to third-party websites. We are not responsible for the
          privacy practices of these external sites. We encourage you to review their privacy
          policies before providing any personal information.
        </p>
      </LegalSection>

      <LegalSection number="10" title="Children's Privacy">
        <p>
          Our services are not intended for individuals under the age of 18. We do not knowingly
          collect personal information from children.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Updates to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any material
          changes by posting the updated policy on our website and updating the "Effective Date."
          Your continued use of our services after such changes constitutes acceptance of the updated policy.
        </p>
      </LegalSection>

      <LegalSection number="12" title="Contact Us">
        <p className="mb-4">
          If you have any questions about this Privacy Policy or our data practices, please contact us at:
        </p>
        <ContactBox
          company="Niyom Wealth Distribution LLP"
          email="support@niyomwealth.com"
          phone="+91 8939433113"
        />
      </LegalSection>
    </LegalDocumentLayout>
  );
}
