import React from "react";
import Trigger from "react-foundation-apps/src/trigger";
import Translate from "react-translate-component";
import ChainTypes from "components/Utility/ChainTypes";
import BindToChainState from "components/Utility/BindToChainState";
import utils from "common/utils";
import BalanceComponent from "components/Utility/BalanceComponent";
import counterpart from "counterpart";
import AmountSelector from "components/Utility/AmountSelector";
import AccountStore from "stores/AccountStore";
import { ChainStore, FetchChain } from "bitsharesjs/es";
import {Asset} from "common/MarketClasses";
import AccountActions from "actions/AccountActions";
import Modal from "react-foundation-apps/src/modal";
import ZfApi from "react-foundation-apps/src/utils/foundation-api";
import { validateAddress, WithdrawAddresses } from "common/blockTradesMethods";
import { checkFeeStatusAsync } from "common/trxHelper";
import { debounce } from "lodash";

class WithdrawModalCryptoBridge extends React.Component {

    static propTypes = {
        account: ChainTypes.ChainAccount.isRequired,
        issuer: ChainTypes.ChainAccount.isRequired,
        asset: ChainTypes.ChainAsset.isRequired,
        output_coin_name: React.PropTypes.string.isRequired,
        output_coin_symbol: React.PropTypes.string.isRequired,
        output_coin_type: React.PropTypes.string.isRequired,
        url: React.PropTypes.string,
        output_wallet_type: React.PropTypes.string,
        output_supports_memos: React.PropTypes.bool.isRequired,
        amount_to_withdraw: React.PropTypes.string,
        balance: ChainTypes.ChainObject
    };

    constructor(props) {
        super(props);

        this.state = {
            withdraw_amount: this.props.amount_to_withdraw,
            withdraw_address: WithdrawAddresses.getLast(props.output_wallet_type),
            withdraw_address_check_in_progress: false,
            withdraw_address_is_valid: true,
            options_is_valid: false,
            confirmation_is_valid: false,
            withdraw_address_selected: WithdrawAddresses.getLast(props.output_wallet_type),
            memo: "",
            withdraw_address_first: true,
            empty_withdraw_value: false,
            from_account: ChainStore.getAccount(AccountStore.getState().currentAccount),
            fee_asset_id: "1.3.0"
        };

        this._checkBalance = this._checkBalance.bind(this);
        this._updateFee = debounce(this._updateFee.bind(this), 250);

        this._validateAddress(this.state.withdraw_address, props);

    }

    componentWillMount() {
        this._updateFee();
    }

    _updateFee(fee_asset_id = this.props.asset.get('id')) {
        checkFeeStatusAsync(
            {accountID: this.props.account.get("id"),
            feeID: fee_asset_id,
            options: ["price_per_kbyte"],
            data: {
                type: "memo",
                content: this.props.output_coin_type + ":" + this.state.withdraw_address + (this.state.memo ? ":" + this.state.memo : "")
            }})
        .then(({fee, hasBalance, hasPoolBalance}) => {
            this.setState({
                feeAmount: fee,
                hasBalance,
                hasPoolBalance,
                error: (!hasBalance || !hasPoolBalance)
            }, this._checkBalance);
        });
    }

    onMemoChanged( e ) {
        this.setState( {memo: e.target.value}, this._updateFee);
    }

    onWithdrawAmountChange( {amount} ) {

        this.setState({
            withdraw_amount: amount,
            empty_withdraw_value: amount !== undefined && !parseFloat(amount),
            insufficient: this.state.feeAmount && amount >= 0.00001 && amount < (this.state.feeAmount.getAmount({real: true}) + parseFloat(this.props.transactionFee, 10))
        }, this._checkBalance);
    }

    onSelectChanged(index) {
        let new_withdraw_address = WithdrawAddresses.get(this.props.output_wallet_type)[index];
        WithdrawAddresses.setLast({wallet: this.props.output_wallet_type, address: new_withdraw_address});

        this.setState({
            withdraw_address_selected: new_withdraw_address,
            options_is_valid: false,
            withdraw_address: new_withdraw_address,
            withdraw_address_check_in_progress: true,
            withdraw_address_is_valid: null
        });
        this._validateAddress(new_withdraw_address);
    }

    onWithdrawAddressChanged( e ) {
        let new_withdraw_address = e.target.value.trim();

        this.setState({
            withdraw_address: new_withdraw_address,
            withdraw_address_check_in_progress: true,
            withdraw_address_selected: new_withdraw_address,
            withdraw_address_is_valid: null
        });
        this._validateAddress(new_withdraw_address);
    }

    _validateAddress(new_withdraw_address, props = this.props) {
        validateAddress({url: props.url, walletType: props.output_wallet_type, newAddress: new_withdraw_address, output_coin_type: props.output_coin_type})
            .then(isValid => {
                if (this.state.withdraw_address === new_withdraw_address) {
                    this.setState({
                        withdraw_address_check_in_progress: false,
                        withdraw_address_is_valid: isValid
                    });
                }
            });
    }

    _checkBalance() {
        const {feeAmount, withdraw_amount} = this.state;
        const {asset} = this.props;

        if (!withdraw_amount) return;

        let amount = parseFloat(String.prototype.replace.call(withdraw_amount, /,/g, ""));
        let sendAmount = new Asset({
            asset_id: asset.get("id"),
            precision: asset.get("precision"),
            real: amount
        });
        if (!this.props.balance)
            return;
        let balance = sendAmount.clone(this.props.balance.get("balance"));

        if (balance.lt(sendAmount)) {
            this.setState({
                balanceError: true
            });
            return false;
        }

        if (sendAmount.asset_id === feeAmount.asset_id) {
            sendAmount.plus(feeAmount);
            if (balance.lt(sendAmount)) {
                this.setState({
                    balanceError: true
                });
                return false;
            }
        }

        this.setState({
            balanceError: false
        });
        return true;
    }

    onSubmit() {

        if ((!this.state.withdraw_address_check_in_progress) && (this.state.withdraw_address && this.state.withdraw_address.length) && (this.state.withdraw_amount !== null)) {
            if (!this.state.withdraw_address_is_valid) {
				ZfApi.publish(this.getWithdrawModalId(), "open");
	        } else if (parseFloat(this.state.withdraw_amount) > 0){
    		   if (!WithdrawAddresses.has(this.props.output_wallet_type)) {

    		        let withdrawals = [];
    				withdrawals.push(this.state.withdraw_address);

                    WithdrawAddresses.set({wallet: this.props.output_wallet_type, addresses: withdrawals});
    				// localStorage.setItem(`history_address_${this.props.output_wallet_type}`, JSON.stringify(withdrawals));
                } else {

                    let withdrawals = WithdrawAddresses.get(this.props.output_wallet_type);
    		        // let withdrawals = JSON.parse(localStorage.getItem(`history_address_${this.props.output_wallet_type}`));
    		        if (withdrawals.indexOf(this.state.withdraw_address) == -1) {

    	                withdrawals.push(this.state.withdraw_address);
                        WithdrawAddresses.set({wallet: this.props.output_wallet_type, addresses: withdrawals});
    					// localStorage.setItem(`history_address_${this.props.output_wallet_type}`, JSON.stringify(withdrawals));
    	            }
    	        }
                this._validateAddress(this.state.withdraw_address);

                WithdrawAddresses.setLast({wallet: this.props.output_wallet_type, address: this.state.withdraw_address});
                // lStorage.setItem(`history_address_last_${this.props.output_wallet_type}`, this.state.withdraw_address);
                let asset = this.props.asset;
                let precision = utils.get_asset_precision(asset.get("precision"));
                let amount = String.prototype.replace.call(this.state.withdraw_amount, /,/g, "");

                const {feeAmount} = this.state;

                if (feeAmount && feeAmount.asset_id !== "1.3.0") {
                    amount = amount - feeAmount.getAmount({real: true});
                }

                if (amount < 0 ) {
                    return false;
                }

		        ZfApi.publish(this.getWithdrawModalId(), "close");





                AccountActions.transfer(
                    this.props.account.get("id"),
                    this.props.issuer.get("id"),
                    parseInt(amount * precision, 10),
                    asset.get("id"),
                    this.props.output_coin_type + ":" + this.state.withdraw_address + (this.state.memo ? ":" + new Buffer(this.state.memo, "utf-8") : ""),
                    null,
                    feeAmount ? feeAmount.asset_id : "1.3.0"
                );

                this.setState({
                    empty_withdraw_value: false
                });
            } else {
                this.setState({
                    empty_withdraw_value: true
                });
            }
        }
	}

    onSubmitConfirmation() {
        ZfApi.publish(this.getWithdrawModalId(), "close");


        if (!WithdrawAddresses.has(this.props.output_wallet_type)) {
	        let withdrawals = [];
			withdrawals.push(this.state.withdraw_address);
            WithdrawAddresses.set({wallet: this.props.output_wallet_type, addresses: withdrawals});
			// localStorage.setItem(`history_address_${this.props.output_wallet_type}`, JSON.stringify(withdrawals));

        } else {
            let withdrawals = WithdrawAddresses.get(this.props.output_wallet_type);
			// let withdrawals = JSON.parse(localStorage.getItem(`history_address_${this.props.output_wallet_type}`));
		    if (withdrawals.indexOf(this.state.withdraw_address) == -1) {
		        withdrawals.push(this.state.withdraw_address);
                WithdrawAddresses.set({wallet: this.props.output_wallet_type, addresses: withdrawals});
				// localStorage.setItem(`history_address_${this.props.output_wallet_type}`, JSON.stringify(withdrawals));
	        }
	    }
        WithdrawAddresses.setLast({wallet: this.props.output_wallet_type, address: this.state.withdraw_address});
		// localStorage.setItem(`history_address_last_${this.props.output_wallet_type}`, this.state.withdraw_address);
        let asset = this.props.asset;
        let precision = utils.get_asset_precision(asset.get("precision"));
        let amount = String.prototype.replace.call(this.state.withdraw_amount, /,/g, "");
        AccountActions.transfer(
            this.props.account.get("id"),
            this.props.issuer.get("id"),
            parseInt(amount * precision, 10),
            asset.get("id"),
    	    this.props.output_coin_type + ":" + this.state.withdraw_address + (this.state.memo ? ":" + new Buffer(this.state.memo, "utf-8") : "")
        );
    }

    onDropDownList() {

		if (WithdrawAddresses.has(this.props.output_wallet_type)) {

			if(this.state.options_is_valid === false) {
				this.setState({options_is_valid: true});
				this.setState({ withdraw_address_first: false });
			}

			if(this.state.options_is_valid === true) {
				this.setState({options_is_valid: false});
			}
		}
    }

    getWithdrawModalId() {
        return this.props.modal_id;
    }

    onAccountBalance() {
        if (Object.keys(this.props.account.get("balances").toJS()).includes(this.props.asset.get("id")) ) {
            this.setState({
                withdraw_amount: this.props.balance.get("balance") / utils.get_asset_precision(this.props.asset.get("precision")),
                empty_withdraw_value: false
            });
        }
    }

    formatAmount(v) {
        // TODO: use asset's precision to format the number
        const precision = this.props.asset.get("precision");

        if (!v) v = "";
        if (typeof v === "number") v = v.toString();
        let value = v.trim().replace(/,/g, "");
        // value = utils.limitByPrecision(value, this.props.asset.get("precision"));
        while (value.substring(0, 2) == "00")
            value = value.substring(1);
        if (value[0] === ".") value = "0" + value;
        else if (value.length) {
            let n = Number(value)
            if (isNaN(n)) {
                value = parseFloat(value);
                if (isNaN(value)) return "";
            }
            let parts = (value + "").split('.');
            value = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            if (parts.length > 1) value += "." + parts[1];
        }
        return value;
    }

    render() {

	    let {withdraw_address_selected, memo} = this.state;
	    let storedAddress = WithdrawAddresses.get(this.props.output_wallet_type);
        let balance = null;

        // console.log( "account: ", this.props.account.toJS() );
        let account_balances = this.props.account.get("balances").toJS();
        // console.log( "balances: ", account_balances );
        let asset_types = Object.keys(account_balances);

        if (asset_types.length > 0) {
            let current_asset_id = this.props.asset.get("id");
            if( current_asset_id )
                balance = (<span><Translate component="span" content="transfer.available"/>: <span className="set-cursor" onClick={this.onAccountBalance.bind(this)}><BalanceComponent balance={account_balances[current_asset_id]}/></span></span>);
            else
                balance = "No funds";
        } else {
            balance = "No funds";
        }


	    let withdrawModalId = this.getWithdrawModalId();
        let invalid_address_message = null;
	    let options = null;
	    let confirmation = null;

	    if (this.state.options_is_valid) {
	        options =
			    <div className={!storedAddress.length ? "blocktrades-disabled-options" : "blocktrades-options"}>
                    {storedAddress.map(function(name, index){
                    return <a key={index} onClick={this.onSelectChanged.bind(this, index)}>{name}</a>;
					}, this)}
                </div>;
		}

        if (!this.state.withdraw_address_check_in_progress && (this.state.withdraw_address && this.state.withdraw_address.length))
        {
            if (!this.state.withdraw_address_is_valid) {

            invalid_address_message = <div className="has-error" style={{paddingTop: 10}}><Translate content="gateway.valid_address" coin_type={this.props.output_coin_type.toUpperCase().replace('BRIDGE.', '')} /></div>;
/*
            confirmation =
			    <Modal id={withdrawModalId} overlay={true}>
                    <Trigger close={withdrawModalId}>
                        <a href="#" className="close-button">&times;</a>
                    </Trigger>
                    <br/>
					<label><Translate content="modal.confirmation.title"/></label>
		 		    <br/>
				    <div className="content-block">
                        <Trigger close={withdrawModalId}>
                            <input type="submit" className="button"
                                onClick={this.onSubmitConfirmation.bind(this)}
                                value={counterpart.translate("modal.confirmation.accept")} />
                        </Trigger>
                        <Trigger close={withdrawModalId}>
                            <a href className="secondary button"><Translate content="modal.confirmation.cancel" /></a>
                        </Trigger>
                    </div>
		        </Modal>;
                */
		    }
            // if (this.state.withdraw_address_is_valid)
            //   invalid_address_message = <Icon name="checkmark-circle" className="success" />;
            // else
            //   invalid_address_message = <Icon name="cross-circle" className="alert" />;
        }

	    let tabIndex = 1;
		let withdraw_memo = null;

		if (this.props.output_supports_memos) {
			withdraw_memo =
				<div className="content-block">
					<label><Translate component="span" content="transfer.memo"/></label>
					<textarea rows="1" value={memo} tabIndex={tabIndex++} onChange={this.onMemoChanged.bind(this)} />
				</div>;
		}
        const coinType = this.props.symbol;
        let amountWithFees;
        let networkFee = 0;

        if (this.state.withdraw_amount ) {
            amountWithFees = String.prototype.replace.call(this.state.withdraw_amount, /,/g, "");
            if (this.props.transactionFee >= 0) {
                amountWithFees = parseFloat(amountWithFees,10 ) - parseFloat(this.props.transactionFee, 10);


                if (!account_balances['1.3.0']) {

                    networkFee = this.state.feeAmount.getAmount({real: true});
                    //console.log('NETWORK FEE' + networkFee);
                    amountWithFees -= networkFee;

                }



            }
        }


        return (<form className="grid-block vertical full-width-content">
            <div className="grid-container">
                <div className="content-block">
                    <h3><Translate content="gateway.withdraw_coin" coin={this.props.output_coin_name} symbol={this.props.output_coin_symbol} /></h3>
                </div>
                <div className="content-block">
                    <AmountSelector label="modal.withdraw.amount"
                        amount={this.state.withdraw_amount}
                        asset={this.props.asset.get("id")}
                        assets={[this.props.asset.get("id")]}
                        placeholder="0.0"
                        onChange={this.onWithdrawAmountChange.bind(this)}
                        display_balance={balance}
                    />
                    {this.state.empty_withdraw_value ? <p className="has-error no-margin" style={{paddingTop: 10}}><Translate content="transfer.errors.valid" /></p>:null}
                    {this.state.insufficient ? <p className="has-error no-margin" style={{paddingTop: 10}}><Translate content="transfer.errors.amountTooLow" /></p>:null}


                </div>
                <div className="content-block">
                    <label><Translate component="span" content="modal.withdraw.address"/></label>
					<div className="blocktrades-select-dropdown">
						<div className="inline-label">
							<input type="text" value={withdraw_address_selected} tabIndex="4" onChange = {this.onWithdrawAddressChanged.bind(this)} autoComplete="off" />
							<span onClick={this.onDropDownList.bind(this)} >&#9660;</span>
						</div>
					</div>
					<div className="blocktrades-position-options">
						{options}
					</div>
					{invalid_address_message}
                </div>
				{withdraw_memo}
                {this.props.transactionFee >= 0.00001 ? <p className="no-margin" style={{paddingTop: 0, paddingBottom: 5}}><Translate content="gateway.cryptobridge_gateway_fee" />: {this.props.transactionFee} {coinType.replace('BRIDGE.', '')}</p>:null}
                {networkFee > 0.00001 && amountWithFees >= 0.0 ? <p className="no-margin" style={{paddingTop: 0, paddingBottom: 5}}><Translate content="gateway.cryptobridge_bts_fee" />: {this.formatAmount(networkFee)} {this.props.output_coin_symbol.replace('BRIDGE.', '')}</p>:null}
                {this.props.transactionFee >= 0.00001 && amountWithFees >= 0.00001 ? <p className="no-margin" style={{paddingTop: 0, paddingBottom: 5}}><Translate content="gateway.cryptobridge_receive" />: {this.formatAmount(amountWithFees)} {this.props.output_coin_symbol.replace('BRIDGE.', '')}</p>: null}

                <div className="content-block">
                    <input type="submit" className="button"
                            onClick={this.onSubmit.bind(this)}
                            value={counterpart.translate("modal.withdraw.submit")} />
                    <Trigger close={this.props.modal_id}>
                        <a href className="secondary button"><Translate content="account.perm.cancel" /></a>
                    </Trigger>
                </div>
				{confirmation}
            </div>
            </form>
	    );
    }


};

export default BindToChainState(WithdrawModalCryptoBridge, {keep_updating:true});