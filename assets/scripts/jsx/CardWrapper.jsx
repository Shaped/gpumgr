class CardWrapper extends React.Component {
	constructor(props){
		super(props);
		this.state={children:[]};
	}
	addChild(child) {
		console.log('cardWr:addch')
		child.ref = React.createRef();
		this.setState({
		  children: [...this.state.children, child],
		});
	}
	render() {
		let possibleChildren = { Card };
		let children=[];
		this.state.children.map((child,i) => {
			console.log({ref:child.ref, key:i, ...child.props});
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i, ...child.props}));
		});
		return (
			<div className="cardWrapper">
				{children}
			</div>
			);
	}
}
