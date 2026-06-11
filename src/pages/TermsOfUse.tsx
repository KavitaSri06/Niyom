import { Scale } from 'lucide-react';
import {
  LegalDocumentLayout,
  LegalSection,
  LegalSubsection,
  LegalList,
  ContactBox
} from '../components/LegalDocumentLayout';

interface TermsOfUseProps {
  onClose: () => void;
}

export function TermsOfUse({ onClose }: TermsOfUseProps) {
  return (
    <LegalDocumentLayout
      title="Terms of Use"
      subtitle="Niyom Wealth Distribution LLP"
      icon={<Scale className="w-16 h-16 text-slate-700" strokeWidth={1.5} />}
      onClose={onClose}
    >
      <LegalSection number="1" title="Acceptance of Terms">
        <p>
          By accessing and using the Niyom Wealth Distribution LLP website and services, you accept
          and agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree
          to these terms, please do not use our services.
        </p>
      </LegalSection>

      <LegalSection number="2" title="Eligibility">
        <p>To use our services, you must:</p>
        <LegalList items={[
          'Be at least 18 years of age',
          'Have the legal capacity to enter into binding contracts',
          'Be a resident of India (unless otherwise specified)',
          'Complete our KYC verification process',
          'Provide accurate and complete information'
        ]} />
      </LegalSection>

      <LegalSection number="3" title="Services Offered">
        <p className="mb-4">Niyom Wealth Distribution LLP provides the following services:</p>
        <LegalList items={[
          'Investment advisory and wealth management services',
          'Distribution of mutual funds',
          'Access to unlisted shares and pre-IPO investments',
          'Secondary bonds trading',
          'Financial planning and portfolio management',
          'Educational resources and market research'
        ]} />
        <p className="mt-4 italic text-slate-600">
          These services are subject to regulatory approvals and compliance requirements.
        </p>
      </LegalSection>

      <LegalSection number="4" title="Account Registration and Security">
        <LegalSubsection number="4.1" title="Account Creation">
          <p>
            You must create an account to access certain services. You agree to provide accurate,
            current, and complete information during registration and to update this information
            to keep it accurate and current.
          </p>
        </LegalSubsection>

        <LegalSubsection number="4.2" title="Account Security">
          <p>You are responsible for:</p>
          <LegalList items={[
            'Maintaining the confidentiality of your account credentials',
            'All activities that occur under your account',
            'Notifying us immediately of any unauthorized use',
            'Ensuring you log out from your account at the end of each session'
          ]} />
        </LegalSubsection>

        <LegalSubsection number="4.3" title="KYC Compliance">
          <p>
            You must complete the KYC process by submitting required documents including PAN card,
            address proof, and bank details. We reserve the right to suspend or terminate accounts
            that fail to complete KYC verification.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="5" title="Investment Transactions">
        <LegalSubsection number="5.1" title="Orders and Execution">
          <p>
            All investment orders are subject to availability, pricing, and regulatory requirements.
            We reserve the right to reject or cancel orders at our discretion.
          </p>
        </LegalSubsection>

        <LegalSubsection number="5.2" title="Payment Terms">
          <p>
            Payment for investments must be made through registered bank accounts only. Third-party
            payments are not accepted. All transactions are subject to verification and may be
            delayed or cancelled if payment is not received within the specified timeframe.
          </p>
        </LegalSubsection>

        <LegalSubsection number="5.3" title="Pricing and Fees">
          <p>
            Prices for unlisted shares and bonds are subject to market conditions and may change
            without notice. Applicable fees, charges, and expenses will be disclosed before
            transaction execution.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="6" title="Investment Risks">
        <p>You acknowledge that:</p>
        <LegalList items={[
          'All investments involve risk, including the risk of loss of principal',
          'Past performance is not indicative of future results',
          'Unlisted shares and bonds are illiquid and may not be easily sold',
          'You should invest only after understanding the risks involved',
          'You should consult independent advisors if necessary',
          'We do not guarantee returns or investment performance'
        ]} />
      </LegalSection>

      <LegalSection number="7" title="Intellectual Property">
        <p>
          All content on our website, including text, graphics, logos, images, and software, is
          the property of Niyom Wealth Distribution LLP and is protected by copyright and intellectual
          property laws. You may not reproduce, distribute, modify, or create derivative works
          without our prior written consent.
        </p>
      </LegalSection>

      <LegalSection number="8" title="Prohibited Activities">
        <p>You agree not to:</p>
        <LegalList items={[
          'Use our services for any illegal purpose or in violation of any laws',
          'Attempt to gain unauthorized access to our systems or other user accounts',
          'Manipulate prices or engage in market manipulation',
          'Transmit viruses, malware, or other harmful code',
          'Interfere with or disrupt our services or servers',
          'Create multiple accounts or use false identities',
          'Engage in money laundering or terrorist financing',
          'Harass, abuse, or harm other users'
        ]} />
      </LegalSection>

      <LegalSection number="9" title="Disclaimers and Limitations of Liability">
        <LegalSubsection number="9.1" title="No Warranties">
          <p>
            Our services are provided "as is" and "as available" without warranties of any kind,
            either express or implied. We do not warrant that our services will be uninterrupted,
            error-free, or secure.
          </p>
        </LegalSubsection>

        <LegalSubsection number="9.2" title="Investment Advice">
          <p>
            Information provided on our platform is for informational purposes only and does not
            constitute investment advice. You should conduct your own research and consult with
            qualified advisors before making investment decisions.
          </p>
        </LegalSubsection>

        <LegalSubsection number="9.3" title="Limitation of Liability">
          <p>
            To the maximum extent permitted by law, we shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages, including loss of profits,
            data, or investment losses.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection number="10" title="Regulatory Compliance">
        <p className="mb-4">Our operations are subject to regulations by:</p>
        <LegalList items={[
          'Securities and Exchange Board of India (SEBI)',
          'Reserve Bank of India (RBI)',
          'Association of Mutual Funds in India (AMFI)',
          'Other relevant regulatory authorities'
        ]} />
        <p className="mt-4">
          We reserve the right to modify our services to comply with regulatory requirements.
        </p>
      </LegalSection>

      <LegalSection number="11" title="Termination">
        <p className="mb-4">We may suspend or terminate your account and access to our services:</p>
        <LegalList items={[
          'For violation of these Terms of Use',
          'For failure to complete KYC requirements',
          'For suspicious or fraudulent activity',
          'At our discretion for any reason'
        ]} />
        <p className="mt-4">
          Upon termination, your right to use our services will cease immediately. We will process
          any pending transactions and return funds in accordance with applicable regulations.
        </p>
      </LegalSection>

      <LegalSection number="12" title="Indemnification">
        <p>
          You agree to indemnify, defend, and hold harmless Niyom Wealth Distribution LLP, its
          officers, directors, employees, and agents from any claims, liabilities, damages, losses,
          and expenses arising from your use of our services or violation of these terms.
        </p>
      </LegalSection>

      <LegalSection number="13" title="Governing Law and Dispute Resolution">
        <p>
          These Terms of Use shall be governed by the laws of India. Any disputes arising from
          these terms or your use of our services shall be subject to the exclusive jurisdiction
          of the courts in Chennai, Tamil Nadu.
        </p>
      </LegalSection>

      <LegalSection number="14" title="Changes to Terms">
        <p>
          We reserve the right to modify these Terms of Use at any time. Material changes will be
          notified through our website or via email. Your continued use of our services after such
          changes constitutes acceptance of the modified terms.
        </p>
      </LegalSection>

      <LegalSection number="15" title="Severability">
        <p>
          If any provision of these Terms of Use is found to be invalid or unenforceable, the
          remaining provisions shall continue in full force and effect.
        </p>
      </LegalSection>

      <LegalSection number="16" title="Contact Information">
        <p className="mb-4">For questions about these Terms of Use, please contact us at:</p>
        <ContactBox
          company="Niyom Wealth Distribution LLP"
          email="support@niyomwealth.com"
          phone="+91 8939433113"
        />
      </LegalSection>
    </LegalDocumentLayout>
  );
}
